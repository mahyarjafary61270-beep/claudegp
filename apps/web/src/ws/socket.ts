import type { ClientEvent, ServerEvent } from '@mg/shared';
import { tokenStore } from '@/api/client';

type Handler = (ev: ServerEvent) => void;

/**
 * Reconnecting WebSocket with exponential backoff.
 * The first frame must be { t: 'auth', token }. On reconnect the client
 * re-authenticates and issues a `sync` frame; REST caches are invalidated
 * by the handler layer to resync anything missed while offline.
 */
class Socket {
  private ws: WebSocket | null = null;
  private handler: Handler | null = null;
  private openHandlers: (() => void)[] = [];
  private backoff = 1000;
  private shouldRun = false;
  private heartbeatTimer: number | null = null;
  private activeFlag = true;
  private lastActivity = Date.now();

  onEvent(handler: Handler): void {
    this.handler = handler;
  }

  /** Fired every time the socket (re)connects and auths — used for cache resync. */
  onOpen(fn: () => void): void {
    this.openHandlers.push(fn);
  }

  start(): void {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.connect();
    this.startHeartbeat();

    // activity tracking → presence idle detection
    const markActive = () => {
      this.lastActivity = Date.now();
      if (!this.activeFlag) {
        this.activeFlag = true;
        this.send({ t: 'heartbeat', active: true });
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'focus']) {
      window.addEventListener(ev, markActive, { passive: true });
    }
    setInterval(() => {
      const idle = Date.now() - this.lastActivity > 5 * 60_000;
      if (idle && this.activeFlag) {
        this.activeFlag = false;
        this.send({ t: 'heartbeat', active: false });
      } else if (!idle) {
        this.send({ t: 'heartbeat', active: true });
      }
    }, 30_000);
  }

  stop(): void {
    this.shouldRun = false;
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.ws?.close();
  }

  send(ev: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(ev));
    }
  }

  requestSync(): void {
    this.send({ t: 'sync' });
  }

  private connect(): void {
    if (!this.shouldRun) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      const token = tokenStore.get();
      if (token) {
        ws.send(JSON.stringify({ t: 'auth', token }));
        for (const fn of this.openHandlers) {
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
      }
    };

    ws.onmessage = (msg) => {
      try {
        const ev = JSON.parse(String(msg.data)) as ServerEvent;
        this.handler?.(ev);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      if (!this.shouldRun) return;
      const delay = Math.min(this.backoff, 15_000);
      this.backoff = Math.min(this.backoff * 2, 15_000);
      window.setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (document.hidden) return; // server pings keep the socket alive
      this.send({ t: 'heartbeat', active: this.activeFlag });
    }, 30_000);
  }
}

export const socket = new Socket();
