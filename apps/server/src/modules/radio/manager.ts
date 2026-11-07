import type { RadioStateDTO } from '@mg/shared';
import { getStation } from '@mg/shared';
import { IngressInput, type CreateIngressOptions } from 'livekit-server-sdk';
import { env } from '../../env';
import { logger } from '../../lib/logger';
import { nextId } from '../../lib/snowflake';
import { prisma } from '../../lib/db';
import { createRadioToken, ingressClient } from '../livekit/clients';
import { voiceTracker } from '../voice/service';
import { createSystemMessage } from '../messages/service';
import { hub } from '../../ws/hub';
import { startRtcPlayer, type RtcPlayerHandle } from './rtc-player';

const AUTO_DISCONNECT_MS = 60_000;

/** DB-level mode (Prisma enum). Converted to the shared lowercase DTO form. */
type DbRadioMode = 'INGRESS' | 'RTC';

interface ActiveRadio {
  channelId: string;
  serverId: string;
  stationId: string;
  mode: DbRadioMode;
  startedById: string;
  ingressId?: string;
  rtc?: RtcPlayerHandle;
  startedAt: number;
  stopping?: boolean;
}

/** Testable auto-disconnect timer: one 60s timer per channel with humans. */
export class DisconnectTimer {
  private timers = new Map<string, NodeJS.Timeout>();

  schedule(key: string, ms: number, fn: () => void): void {
    this.cancel(key);
    const t = setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, ms);
    t.unref();
    this.timers.set(key, t);
  }

  cancel(key: string): void {
    const t = this.timers.get(key);
    if (t) {
      clearTimeout(t);
      this.timers.delete(key);
    }
  }

  isScheduled(key: string): boolean {
    return this.timers.has(key);
  }
}

export function countHumans(identities: Iterable<string>): number {
  let n = 0;
  for (const id of identities) if (!id.startsWith('radio:')) n++;
  return n;
}

class RadioManager {
  private active = new Map<string, ActiveRadio>();
  private disconnectTimer = new DisconnectTimer();

  get(channelId: string): ActiveRadio | undefined {
    return this.active.get(channelId);
  }

  listForServers(serverIds: string[]): RadioStateDTO[] {
    const out: RadioStateDTO[] = [];
    for (const r of this.active.values()) {
      if (serverIds.includes(r.serverId)) out.push(this.toDto(r));
    }
    return out;
  }

  listAll(): RadioStateDTO[] {
    return [...this.active.values()].map((r) => this.toDto(r));
  }

  private toDto(r: ActiveRadio): RadioStateDTO {
    return {
      channelId: r.channelId,
      stationId: r.stationId,
      mode: r.mode === 'INGRESS' ? 'ingress' : 'rtc',
      startedById: r.startedById,
      startedAt: new Date(r.startedAt).toISOString(),
      listeners: countHumans(voiceTracker.humansIn(r.channelId)),
    };
  }

  private broadcastState(r: ActiveRadio | null, channelId: string): void {
    const serverId = r?.serverId;
    if (serverId) {
      hub.sendToServer(serverId, { t: 'radio_state', channelId, radio: r ? this.toDto(r) : null });
    } else {
      const active = this.active.get(channelId);
      if (active) hub.sendToServer(active.serverId, { t: 'radio_state', channelId, radio: active ? this.toDto(active) : null });
      else {
        // find server via channel
        void prisma.channel
          .findUnique({ where: { id: channelId }, select: { serverId: true } })
          .then((ch) => {
            if (ch?.serverId) hub.sendToServer(ch.serverId, { t: 'radio_state', channelId, radio: null });
          })
          .catch(() => undefined);
      }
    }
  }

  /**
   * Start (or switch) the radio in a voice channel.
   * Strategy: Ingress (URL_INPUT) when allowed, falling back to rtc-node+ffmpeg.
   */
  async start(channelId: string, stationId: string, startedBy: string): Promise<RadioStateDTO> {
    const station = getStation(stationId);
    if (!station) throw new Error('unknown station');
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'VOICE' || !channel.serverId) throw new Error('not a voice channel');

    const existing = this.active.get(channelId);
    if (existing && !existing.stopping) {
      if (existing.stationId === stationId) return this.toDto(existing);
      await this.stop(channelId, 'switch');
    }

    const others = this.active.size;
    if (others >= env.MAX_CONCURRENT_RADIOS) {
      throw new RadioLimitError(env.MAX_CONCURRENT_RADIOS);
    }

    const roomName = voiceTracker.roomName(channelId);
    const identity = `radio:${channelId}`;
    const metadata = JSON.stringify({ type: 'radio', stationId: station.id });
    let mode: DbRadioMode;
    let ingressId: string | undefined;
    let rtc: RtcPlayerHandle | undefined;

    const wantIngress = env.RADIO_MODE === 'ingress' || env.RADIO_MODE === 'auto';
    if (wantIngress) {
      try {
        const opts: CreateIngressOptions = {
          name: `Radio · ${station.name}`,
          roomName,
          participantIdentity: identity,
          participantName: station.name,
          participantMetadata: metadata,
          url: station.url,
          enableTranscoding: true,
        };
        const ingress = await ingressClient.createIngress(IngressInput.URL_INPUT, opts);
        ingressId = ingress.ingressId;
        mode = 'INGRESS';
        logger.info({ channelId, ingressId }, 'radio ingress created');
      } catch (err) {
        if (env.RADIO_MODE === 'ingress') throw err;
        logger.info({ err: (err as Error).message }, 'ingress unavailable, falling back to rtc-node');
        mode = 'RTC';
      }
    } else {
      mode = 'RTC';
    }

    if (mode === 'RTC') {
      const token = await createRadioToken({ identity, name: station.name, room: roomName, metadata });
      rtc = await startRtcPlayer({
        url: station.url,
        room: roomName,
        identity,
        name: station.name,
        metadata,
        token,
        onFatal: (err) => {
          logger.error({ err, channelId }, 'radio stream fatal');
          void this.handleFatal(channelId, err);
        },
      });
    }

    const active: ActiveRadio = {
      channelId,
      serverId: channel.serverId,
      stationId: station.id,
      mode,
      startedById: startedBy,
      ingressId,
      rtc,
      startedAt: Date.now(),
    };
    this.active.set(channelId, active);

    await prisma.radioState.upsert({
      where: { channelId },
      create: { channelId, serverId: channel.serverId, stationId: station.id, mode, ingressId: ingressId ?? null, startedById: startedBy },
      update: { stationId: station.id, mode, ingressId: ingressId ?? null, lastActiveAt: new Date() },
    });

    this.broadcastState(active, channelId);
    await createSystemMessage(channelId, `📻 Radio started: ${station.emoji} **${station.name}**`);
    return this.toDto(active);
  }

  private async handleFatal(channelId: string, err: Error): Promise<void> {
    const active = this.active.get(channelId);
    if (!active || active.stopping) return;
    await this.stop(channelId, 'fatal');
    await createSystemMessage(channelId, `⚠️ Radio stopped — the stream failed repeatedly. (${err.message})`);
  }

  /** Stop the radio; posts a system message only when asked (auto-disconnect/failure). */
  async stop(channelId: string, reason: 'manual' | 'auto' | 'switch' | 'fatal' | 'channel-deleted'): Promise<void> {
    const active = this.active.get(channelId);
    this.disconnectTimer.cancel(channelId);
    await prisma.radioState.deleteMany({ where: { channelId } }).catch(() => undefined);
    if (!active) return;
    active.stopping = true;
    this.active.delete(channelId);

    try {
      if (active.mode === 'INGRESS' && active.ingressId) {
        await ingressClient.deleteIngress(active.ingressId).catch((err: unknown) => {
          logger.warn({ err, ingressId: active.ingressId }, 'ingress delete failed');
        });
      } else if (active.rtc) {
        await active.rtc.stop();
      }
    } finally {
      this.broadcastState(null, channelId);
      if (reason === 'auto') {
        await createSystemMessage(channelId, '🔇 Radio stopped — nobody was listening for a minute.');
      } else if (reason === 'channel-deleted') {
        /* channel gone; nothing to post */
      }
    }
  }

  // ---- human join/leave hooks (from voiceTracker) ----

  onHumanJoined(channelId: string): void {
    const active = this.active.get(channelId);
    if (!active) return;
    if (this.disconnectTimer.isScheduled(channelId)) {
      this.disconnectTimer.cancel(channelId);
      logger.debug({ channelId }, 'radio auto-disconnect cancelled: human rejoined');
    }
    this.broadcastState(active, channelId);
  }

  onHumanLeft(channelId: string): void {
    const active = this.active.get(channelId);
    if (!active || active.stopping) return;
    const humans = countHumans(voiceTracker.humansIn(channelId));
    if (humans > 0) {
      this.broadcastState(active, channelId);
      return;
    }
    if (this.disconnectTimer.isScheduled(channelId)) return;
    logger.debug({ channelId }, 'last human left; radio auto-disconnect in 60s');
    this.disconnectTimer.schedule(channelId, AUTO_DISCONNECT_MS, () => {
      void (async () => {
        const still = this.active.get(channelId);
        if (!still) return;
        if (countHumans(voiceTracker.humansIn(channelId)) > 0) return;
        await this.stop(channelId, 'auto');
      })().catch((err) => logger.error({ err }, 'auto-disconnect failed'));
    });
  }

  /** Boot cleanup: remove persisted radio state and orphan ingresses. */
  async cleanupAtBoot(): Promise<void> {
    try {
      const rows = await prisma.radioState.findMany();
      for (const row of rows) {
        if (row.mode === 'INGRESS' && row.ingressId) {
          await ingressClient.deleteIngress(row.ingressId).catch(() => undefined);
        }
      }
      await prisma.radioState.deleteMany({});
      // sweep any ingress we own but don't track
      const ingresses = await ingressClient.listIngress(undefined).catch(() => []);
      for (const ing of ingresses) {
        if (ing.roomName?.startsWith('voice:') || ing.participantIdentity?.startsWith('radio:')) {
          await ingressClient.deleteIngress(ing.ingressId).catch(() => undefined);
        }
      }
      if (rows.length > 0) logger.info({ cleaned: rows.length }, 'stale radio state cleaned');
    } catch (err) {
      logger.warn({ err }, 'radio boot cleanup failed (livekit unreachable?)');
    }
  }

  async stopAll(): Promise<void> {
    const ids = [...this.active.keys()];
    await Promise.allSettled(ids.map((id) => this.stop(id, 'manual')));
  }
}

export class RadioLimitError extends Error {
  constructor(public max: number) {
    super(`All ${max} radio slots are busy right now`);
  }
}

export const radioManager = new RadioManager();
