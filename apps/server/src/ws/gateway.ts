import type { WebSocket } from 'ws';
import type { ClientEvent } from '@mg/shared';
import { userFromAccessToken } from '../modules/auth/service';
import { toUserDTO } from '../modules/serialize';
import { hub } from './hub';
import { onConnect, onDisconnect, setActivity } from './presence';
import { voiceTracker } from '../modules/voice/service';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';

const AUTH_TIMEOUT_MS = 10_000;
const MAX_FRAME = 4 * 1024;

function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw as ArrayBuffer);
}

export async function gatewayHandler(socket: WebSocket): Promise<void> {
  let client: ReturnType<typeof hub.add> | null = null;
  let authed = false;
  let closed = false;

  const authTimer = setTimeout(() => {
    if (!authed && !closed) {
      socket.close(4001, 'auth timeout');
      closed = true;
    }
  }, AUTH_TIMEOUT_MS);
  authTimer.unref();

  socket.on('message', (raw: unknown) => {
    const buf = toBuffer(raw);
    if (buf.length > MAX_FRAME) return;
    let ev: ClientEvent;
    try {
      ev = JSON.parse(buf.toString()) as ClientEvent;
    } catch {
      return;
    }

    if (!authed) {
      if (ev.t !== 'auth') {
        socket.close(4001, 'expected auth');
        closed = true;
        return;
      }
      void handleAuth(ev.token);
      return;
    }

    switch (ev.t) {
      case 'heartbeat': {
        setActivity(client!.userId, ev.active !== false);
        break;
      }
      case 'typing': {
        void handleTyping(client!, ev.channelId);
        break;
      }
      case 'voice_flags': {
        void voiceTracker.applyFlags(client!.userId, { muted: ev.muted, deafened: ev.deafened });
        break;
      }
      case 'sync': {
        void handleSync(client!.userId);
        break;
      }
      case 'auth':
      default:
        break;
    }
  });

  socket.on('pong', () => {
    if (client) client.alive = true;
  });

  socket.on('close', () => {
    closed = true;
    clearTimeout(authTimer);
    if (client) {
      hub.remove(client);
      onDisconnect(client.userId);
      logger.debug({ userId: client.userId }, 'ws disconnected');
    }
  });

  socket.on('error', () => {
    /* close will follow */
  });

  async function handleAuth(token: string): Promise<void> {
    if (authed || closed) return;
    const user = await userFromAccessToken(token).catch(() => null);
    if (!user) {
      socket.close(4003, 'invalid token');
      closed = true;
      return;
    }
    authed = true;
    clearTimeout(authTimer);
    client = hub.add(socket, user.id);
    onConnect(user.id);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const safeSend = (data: string) => {
      if (!closed && socket.readyState === socket.OPEN) socket.send(data);
    };
    safeSend(JSON.stringify({ t: 'hello' }));
    if (dbUser) safeSend(JSON.stringify({ t: 'ready', user: toUserDTO(dbUser) }));
    await handleSync(user.id);
    logger.debug({ userId: user.id }, 'ws authenticated');
  }

  async function handleTyping(clientRef: { userId: string; lastTypingAt: Map<string, number> }, channelId: string): Promise<void> {
    if (!hub.canSendTyping(clientRef as never, channelId)) return;
    // authorize: must have access to the channel (member of its server or DM participant)
    const ch = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true, type: true } });
    if (!ch) return;
    const user = await prisma.user.findUnique({ where: { id: clientRef.userId }, select: { displayName: true } });
    if (!user) return;
    if (ch.serverId) {
      const isMember = hub.userServers.get(clientRef.userId)?.has(ch.serverId);
      if (!isMember) return;
      hub.sendToServer(ch.serverId, { t: 'typing', channelId, userId: clientRef.userId, displayName: user.displayName }, clientRef.userId);
    } else if (ch.type === 'DM') {
      const partners = hub.dmPartners.get(clientRef.userId) ?? new Set<string>();
      hub.sendToUsers([clientRef.userId, ...partners], { t: 'typing', channelId, userId: clientRef.userId, displayName: user.displayName });
    }
  }

  async function handleSync(userId: string): Promise<void> {
    const serverIds = [...(hub.userServers.get(userId) ?? [])];
    try {
      const voiceRooms = await voiceTracker.snapshotForServers(serverIds);
      for (const vr of voiceRooms) {
        safeSendOrDirect(userId, JSON.stringify({ t: 'voice_room', channelId: vr.channelId, members: vr.members }));
      }
      const { radioManager } = await import('../modules/radio/manager');
      for (const state of radioManager.listForServers(serverIds)) {
        safeSendOrDirect(userId, JSON.stringify({ t: 'radio_state', channelId: state.channelId, radio: state }));
      }
    } catch (err) {
      logger.warn({ err }, 'ws sync failed');
    }
  }

  function safeSendOrDirect(userId: string, data: string): void {
    if (client && client.userId === userId && !closed && socket.readyState === socket.OPEN) {
      socket.send(data);
    } else {
      hub.send(userId, JSON.parse(data));
    }
  }
}

/** Server-side ping/pong sweep — Railway's proxy kills idle connections, so ping every 25s. */
export function startWsHeartbeat(): NodeJS.Timeout {
  const t = setInterval(() => {
    hub.sweepDeadSockets();
  }, 25_000);
  t.unref();
  return t;
}
