import type { WebSocket } from 'ws';
import type { ServerEvent } from '@mg/shared';
import { logger } from '../lib/logger';

interface Client {
  id: number;
  socket: WebSocket;
  userId: string;
  authed: boolean;
  alive: boolean;
  lastTypingAt: Map<string, number>;
}

let nextClientId = 1;

/**
 * In-memory pub/sub hub. Single process, so a plain Map is all we need.
 * Audience indexes are kept up to date by the servers/dms modules.
 */
class Hub {
  private clients = new Map<number, Client>();
  private byUser = new Map<string, Set<number>>();
  /** serverId -> userIds (members) */
  serverMembers = new Map<string, Set<string>>();
  /** userId -> serverIds (fast audience lookup) */
  userServers = new Map<string, Set<string>>();
  /** userId -> set of DM partner userIds */
  dmPartners = new Map<string, Set<string>>();

  add(socket: WebSocket, userId: string): Client {
    const client: Client = {
      id: nextClientId++,
      socket,
      userId,
      authed: true,
      alive: true,
      lastTypingAt: new Map(),
    };
    this.clients.set(client.id, client);
    const set = this.byUser.get(userId) ?? new Set<number>();
    set.add(client.id);
    this.byUser.set(userId, set);
    return client;
  }

  remove(client: Client): void {
    this.clients.delete(client.id);
    const set = this.byUser.get(client.userId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) this.byUser.delete(client.userId);
    }
  }

  isOnline(userId: string): boolean {
    return this.byUser.has(userId);
  }

  onlineUserIds(): string[] {
    return [...this.byUser.keys()];
  }

  send(userId: string, ev: ServerEvent): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    const data = JSON.stringify(ev);
    for (const id of set) {
      const c = this.clients.get(id);
      if (c && c.socket.readyState === c.socket.OPEN) {
        c.socket.send(data, (err) => {
          if (err) logger.debug({ err }, 'ws send failed');
        });
      }
    }
  }

  sendToUsers(userIds: Iterable<string>, ev: ServerEvent): void {
    const data = JSON.stringify(ev);
    const seen = new Set<string>();
    for (const userId of userIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      const set = this.byUser.get(userId);
      if (!set) continue;
      for (const id of set) {
        const c = this.clients.get(id);
        if (c && c.socket.readyState === c.socket.OPEN) c.socket.send(data);
      }
    }
  }

  /** Everyone connected (used sparingly, e.g. presence for DM partners) */
  sendToAudience(audience: Iterable<string>, ev: ServerEvent): void {
    this.sendToUsers(audience, ev);
  }

  sendToServer(serverId: string, ev: ServerEvent, exceptUserId?: string): void {
    const members = this.serverMembers.get(serverId);
    if (!members) return;
    const data = JSON.stringify(ev);
    for (const userId of members) {
      if (userId === exceptUserId) continue;
      const set = this.byUser.get(userId);
      if (!set) continue;
      for (const id of set) {
        const c = this.clients.get(id);
        if (c && c.socket.readyState === c.socket.OPEN) c.socket.send(data);
      }
    }
  }

  /** Audience that should observe a user's presence: co-members + DM partners */
  presenceAudience(userId: string): string[] {
    const out = new Set<string>();
    const servers = this.userServers.get(userId);
    if (servers) {
      for (const sid of servers) {
        const members = this.serverMembers.get(sid);
        if (members) for (const u of members) out.add(u);
      }
    }
    const partners = this.dmPartners.get(userId);
    if (partners) for (const u of partners) out.add(u);
    out.add(userId);
    return [...out];
  }

  // ---- audience index maintenance ----

  rebuildIndexes(data: { serverMembers: { serverId: string; userId: string }[]; dmPairs: { a: string; b: string }[] }): void {
    this.serverMembers.clear();
    this.userServers.clear();
    this.dmPartners.clear();
    for (const m of data.serverMembers) {
      const set = this.serverMembers.get(m.serverId) ?? new Set<string>();
      set.add(m.userId);
      this.serverMembers.set(m.serverId, set);
      const us = this.userServers.get(m.userId) ?? new Set<string>();
      us.add(m.serverId);
      this.userServers.set(m.userId, us);
    }
    for (const p of data.dmPairs) {
      const a = this.dmPartners.get(p.a) ?? new Set<string>();
      a.add(p.b);
      this.dmPartners.set(p.a, a);
      const b = this.dmPartners.get(p.b) ?? new Set<string>();
      b.add(p.a);
      this.dmPartners.set(p.b, b);
    }
  }

  addServerMembership(serverId: string, userId: string): void {
    const set = this.serverMembers.get(serverId) ?? new Set<string>();
    set.add(userId);
    this.serverMembers.set(serverId, set);
    const us = this.userServers.get(userId) ?? new Set<string>();
    us.add(serverId);
    this.userServers.set(userId, us);
  }

  removeServerMembership(serverId: string, userId: string): void {
    this.serverMembers.get(serverId)?.delete(userId);
    this.userServers.get(userId)?.delete(serverId);
  }

  addDmPair(a: string, b: string): void {
    const sa = this.dmPartners.get(a) ?? new Set<string>();
    sa.add(b);
    this.dmPartners.set(a, sa);
    const sb = this.dmPartners.get(b) ?? new Set<string>();
    sb.add(a);
    this.dmPartners.set(b, sb);
  }

  canSendTyping(client: Client, channelId: string, cooldownMs = 2000): boolean {
    const now = Date.now();
    const last = client.lastTypingAt.get(channelId) ?? 0;
    if (now - last < cooldownMs) return false;
    client.lastTypingAt.set(channelId, now);
    return true;
  }

  /** Ping every socket; terminate the ones that missed two pongs. */
  sweepDeadSockets(): void {
    for (const c of this.clients.values()) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      if (!c.alive) {
        c.socket.terminate();
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }
}

export const hub = new Hub();
