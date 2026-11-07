import type { Presence } from '@mg/shared';
import { prisma } from '../lib/db';
import { hub } from './hub';

const IDLE_AFTER_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;
const DISCONNECT_GRACE_MS = 10 * 1000;

interface UserPresence {
  connections: number;
  active: boolean;
  lastActiveAt: number;
  disconnectedAt: number | null;
  presence: Presence;
}

const state = new Map<string, UserPresence>();

function broadcastPresence(userId: string, presence: Presence): void {
  hub.sendToAudience(hub.presenceAudience(userId), { t: 'presence', userId, presence });
}

export function onConnect(userId: string): void {
  const s = state.get(userId);
  if (s) {
    s.connections += 1;
    s.disconnectedAt = null;
    if (s.presence === 'offline') {
      s.presence = 'online';
      broadcastPresence(userId, 'online');
    }
  } else {
    state.set(userId, { connections: 1, active: true, lastActiveAt: Date.now(), disconnectedAt: null, presence: 'online' });
    broadcastPresence(userId, 'online');
  }
}

export function onDisconnect(userId: string): void {
  const s = state.get(userId);
  if (!s) return;
  s.connections -= 1;
  if (s.connections <= 0) {
    s.connections = 0;
    s.disconnectedAt = Date.now();
    // short grace period absorbs quick reconnects (mobile network, refresh)
    setTimeout(() => {
      const cur = state.get(userId);
      if (cur && cur.connections === 0 && cur.disconnectedAt && Date.now() - cur.disconnectedAt >= DISCONNECT_GRACE_MS - 50) {
        cur.presence = 'offline';
        broadcastPresence(userId, 'offline');
        void prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
        state.delete(userId);
      }
    }, DISCONNECT_GRACE_MS).unref();
  }
}

export function setActivity(userId: string, active: boolean): void {
  const s = state.get(userId);
  if (!s) return;
  s.active = active;
  s.lastActiveAt = active ? Date.now() : s.lastActiveAt;
  if (active && s.presence === 'idle') {
    s.presence = 'online';
    broadcastPresence(userId, 'online');
  }
}

export function getPresence(userId: string): Presence {
  return state.get(userId)?.presence ?? 'offline';
}

export function startPresenceSweep(): NodeJS.Timeout {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [userId, s] of state) {
      if (s.connections > 0 && s.presence === 'online' && now - s.lastActiveAt > IDLE_AFTER_MS) {
        s.presence = 'idle';
        broadcastPresence(userId, 'idle');
      }
    }
  }, SWEEP_INTERVAL_MS);
  t.unref();
  return t;
}
