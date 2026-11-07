import type { VoiceMemberDTO } from '@mg/shared';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { hub } from '../../ws/hub';

export interface ParticipantInfo {
  identity: string;
  name?: string;
  metadata?: string;
}

interface LiveParticipant {
  identity: string;
  name: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  isBot: boolean;
  stationId?: string;
  metadata: { displayName?: string; avatarUrl?: string | null; accentColor?: string | null };
}

function parseMetadata(raw: string | undefined): LiveParticipant['metadata'] {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    return {
      displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
      avatarUrl: typeof m.avatarUrl === 'string' ? m.avatarUrl : null,
      accentColor: typeof m.accentColor === 'string' ? m.accentColor : null,
    };
  } catch {
    return {};
  }
}

/**
 * Voice presence tracker. Source of truth is LiveKit (webhooks + 30s sweep).
 * Keyed by channelId; LiveKit room name = `voice:<channelId>`.
 * Human identities are plain userIds, radio bots are `radio:<channelId>`.
 */
class VoiceTracker {
  private rooms = new Map<string, Map<string, LiveParticipant>>();
  private channelServer = new Map<string, string>();

  roomName(channelId: string): string {
    return `voice:${channelId}`;
  }

  channelIdFromRoom(roomName: string): string | null {
    return roomName.startsWith('voice:') ? roomName.slice(6) : null;
  }

  /** Resolve + cache which server a voice channel belongs to. */
  async serverOfChannel(channelId: string): Promise<string | null> {
    const cached = this.channelServer.get(channelId);
    if (cached) return cached;
    const ch = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
    if (!ch?.serverId) return null;
    this.channelServer.set(channelId, ch.serverId);
    return ch.serverId;
  }

  invalidateChannel(channelId: string): void {
    this.channelServer.delete(channelId);
    this.rooms.delete(channelId);
  }

  private participantFromInfo(info: ParticipantInfo): LiveParticipant {
    const isBot = info.identity.startsWith('radio:');
    let stationId: string | undefined;
    if (isBot) {
      const meta = parseMetadata(info.metadata);
      try {
        const m = JSON.parse(info.metadata ?? '{}') as { stationId?: string };
        if (typeof m.stationId === 'string') stationId = m.stationId;
      } catch {
        /* ignore */
      }
      return {
        identity: info.identity,
        name: info.name ?? 'Radio',
        muted: false,
        deafened: false,
        streaming: true,
        isBot: true,
        stationId,
        metadata: meta,
      };
    }
    return {
      identity: info.identity,
      name: info.name ?? '',
      muted: false,
      deafened: false,
      streaming: false,
      isBot: false,
      metadata: parseMetadata(info.metadata),
    };
  }

  async onJoined(channelId: string, info: ParticipantInfo): Promise<void> {
    const p = this.participantFromInfo(info);
    const room = this.rooms.get(channelId) ?? new Map<string, LiveParticipant>();
    const existing = room.get(info.identity);
    room.set(info.identity, existing ? { ...existing, ...p, muted: existing.muted && !p.isBot, deafened: existing.deafened && !p.isBot, streaming: p.streaming || existing.streaming } : p);
    this.rooms.set(channelId, room);
    await this.broadcastRoom(channelId);
    const serverId = await this.serverOfChannel(channelId);
    if (serverId && !p.isBot) {
      const { radioManager } = await import('../radio/manager');
      radioManager.onHumanJoined(channelId);
    }
  }

  async onLeft(channelId: string, identity: string): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;
    room.delete(identity);
    if (room.size === 0) this.rooms.delete(channelId);
    await this.broadcastRoom(channelId);
    if (!identity.startsWith('radio:')) {
      const { radioManager } = await import('../radio/manager');
      radioManager.onHumanLeft(channelId);
    }
  }

  async onRoomFinished(channelId: string): Promise<void> {
    this.rooms.delete(channelId);
    await this.broadcastRoom(channelId);
    const { radioManager } = await import('../radio/manager');
    radioManager.onHumanLeft(channelId);
  }

  /** Client-announced flags (mute/deafen) — merged with LiveKit state. */
  async applyFlags(userId: string, flags: { muted?: boolean; deafened?: boolean; streaming?: boolean }): Promise<void> {
    let changed = false;
    for (const [channelId, room] of this.rooms) {
      const p = room.get(userId);
      if (!p) continue;
      if (flags.muted !== undefined && p.muted !== flags.muted) {
        p.muted = flags.muted;
        changed = true;
      }
      if (flags.deafened !== undefined && p.deafened !== flags.deafened) {
        p.deafened = flags.deafened;
        changed = true;
      }
      if (flags.streaming !== undefined && p.streaming !== flags.streaming) {
        p.streaming = flags.streaming;
        changed = true;
      }
      if (changed) await this.broadcastRoom(channelId);
    }
  }

  setStreaming(channelId: string, identity: string, streaming: boolean): void {
    const p = this.rooms.get(channelId)?.get(identity);
    if (!p || p.streaming === streaming) return;
    p.streaming = streaming;
    void this.broadcastRoom(channelId);
  }

  membersOf(channelId: string): VoiceMemberDTO[] {
    const room = this.rooms.get(channelId);
    if (!room) return [];
    return [...room.values()].map((p) => ({
      userId: p.identity,
      displayName: p.metadata.displayName || p.name || p.identity,
      avatarUrl: p.metadata.avatarUrl ?? null,
      accentColor: p.metadata.accentColor ?? null,
      isBot: p.isBot,
      muted: p.muted,
      deafened: p.deafened,
      streaming: p.streaming,
      stationId: p.stationId,
    }));
  }

  humansIn(channelId: string): string[] {
    const room = this.rooms.get(channelId);
    if (!room) return [];
    return [...room.keys()].filter((i) => !i.startsWith('radio:'));
  }

  async broadcastRoom(channelId: string): Promise<void> {
    const serverId = await this.serverOfChannel(channelId).catch(() => null);
    const members = this.membersOf(channelId);
    if (serverId) {
      hub.sendToServer(serverId, { t: 'voice_room', channelId, members });
    } else {
      hub.sendToUsers(this.humansIn(channelId), { t: 'voice_room', channelId, members });
    }
  }

  /** Full-state snapshots for a user's servers (used on ws sync). */
  async snapshotForServers(serverIds: string[]): Promise<{ channelId: string; members: VoiceMemberDTO[] }[]> {
    const out: { channelId: string; members: VoiceMemberDTO[] }[] = [];
    for (const [channelId] of this.rooms) {
      const serverId = this.channelServer.get(channelId);
      if (serverId && serverIds.includes(serverId)) {
        out.push({ channelId, members: this.membersOf(channelId) });
      }
    }
    return out;
  }

  /** Reconciliation sweep: replace state with what LiveKit reports. */
  async syncFromLivekit(rooms: { name: string; participants: ParticipantInfo[] }[]): Promise<void> {
    const seen = new Set<string>();
    for (const lr of rooms) {
      const channelId = this.channelIdFromRoom(lr.name);
      if (!channelId) continue;
      seen.add(channelId);
      const prev = this.rooms.get(channelId);
      const next = new Map<string, LiveParticipant>();
      for (const p of lr.participants) {
        const old = prev?.get(p.identity);
        const np = this.participantFromInfo(p);
        if (old && !np.isBot) {
          np.muted = old.muted;
          np.deafened = old.deafened;
        }
        next.set(p.identity, np);
      }
      this.rooms.set(channelId, next);
      const prevIds = new Set(prev?.keys() ?? []);
      const nextIds = new Set(next.keys());
      const diff =
        prevIds.size !== nextIds.size ||
        [...nextIds].some((id) => !prevIds.has(id)) ||
        [...prevIds].some((id) => !nextIds.has(id));
      if (diff || !prev) {
        await this.broadcastRoom(channelId);
        const hadHumans = prev ? [...prevIds].some((i) => !i.startsWith('radio:')) : false;
        const hasHumans = [...nextIds].some((i) => !i.startsWith('radio:'));
        const { radioManager } = await import('../radio/manager');
        if (!hadHumans && hasHumans) radioManager.onHumanJoined(channelId);
        if (hadHumans && !hasHumans) radioManager.onHumanLeft(channelId);
      }
    }
    // Rooms LiveKit no longer reports
    for (const channelId of [...this.rooms.keys()]) {
      if (!seen.has(channelId)) {
        logger.debug({ channelId }, 'voice room disappeared from livekit, clearing');
        this.rooms.delete(channelId);
        await this.broadcastRoom(channelId);
        const { radioManager } = await import('../radio/manager');
        radioManager.onHumanLeft(channelId);
      }
    }
  }

  async participantsForApi(): Promise<ParticipantInfo[][]> {
    const out: ParticipantInfo[][] = [];
    for (const [, room] of this.rooms) {
      out.push([...room.values()].map((p) => ({ identity: p.identity, name: p.name, metadata: JSON.stringify({ ...p.metadata, stationId: p.stationId }) })));
    }
    return out;
  }
}

export const voiceTracker = new VoiceTracker();
