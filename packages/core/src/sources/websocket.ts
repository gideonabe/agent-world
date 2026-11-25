import {
  parseServerMessage,
  type AgentWorldEvent,
  type ClientMessage,
  type EventEnvelope,
} from '@agent-viz/protocol';
import type { BidirectionalEventSource, ConnectionStatus, SourceControls } from './types';

/** Minimal WebSocket surface (browser WebSocket, Node 22+ global, or `ws`). */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}
export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WebSocketSourceOptions {
  /** e.g. ws://localhost:8787/ws */
  url: string;
  /** Sent as `?token=` (browsers can't set WebSocket headers). */
  token?: string;
  /** Reconnect backoff bounds (ms). */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Keep-alive interval (ms). 0 disables. */
  pingMs?: number;
  /** Max upstream events buffered while offline. */
  maxBuffer?: number;
  /** Custom socket constructor (tests, Node `ws`). Defaults to global WebSocket. */
  createSocket?: WebSocketFactory;
}

const OPEN = 1;

/**
 * Streams events from an Agent World server. Reconnects with jittered
 * exponential backoff and re-syncs from the server snapshot on every
 * (re)connect, so missed events never leave the world inconsistent.
 */
export class WebSocketEventSource implements BidirectionalEventSource {
  readonly name = 'websocket';
  private ws: WebSocketLike | null = null;
  private emit: ((env: EventEnvelope) => void) | null = null;
  private controls: SourceControls | undefined;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private outbox: AgentWorldEvent[] = [];
  private listeners = new Set<(s: ConnectionStatus) => void>();
  private _status: ConnectionStatus = 'idle';
  private opts: Required<Omit<WebSocketSourceOptions, 'token' | 'createSocket'>> & Pick<WebSocketSourceOptions, 'token' | 'createSocket'>;
  /** Server clock minus local clock, from the last hello/pong (ms). */
  clockOffset = 0;
  lastError: string | undefined;

  constructor(options: WebSocketSourceOptions) {
    this.opts = {
      minBackoffMs: 500,
      maxBackoffMs: 15000,
      pingMs: 20000,
      maxBuffer: 500,
      ...options,
    };
  }

  get status() {
    return this._status;
  }

  /** Subscribe to connection status; returns unsubscribe. */
  onStatus(fn: (s: ConnectionStatus) => void) {
    this.listeners.add(fn);
    fn(this._status);
    return () => void this.listeners.delete(fn);
  }

  start(emit: (env: EventEnvelope) => void, controls?: SourceControls) {
    this.emit = emit;
    this.controls = controls;
    this.open();
  }

  stop() {
    this.emit = null;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'client stop');
    }
    this.setStatus('closed');
  }

  /** Send commands upstream; buffered (bounded) while disconnected. */
  send(events: AgentWorldEvent[]) {
    if (this.ws?.readyState === OPEN) this.write({ kind: 'events', events });
    else {
      this.outbox.push(...events);
      if (this.outbox.length > this.opts.maxBuffer) this.outbox.splice(0, this.outbox.length - this.opts.maxBuffer);
    }
  }

  // ---------------------------------------------------------------------------

  private open() {
    if (!this.emit) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const url = this.opts.token ? `${this.opts.url}${this.opts.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.opts.token)}` : this.opts.url;
    let ws: WebSocketLike;
    try {
      ws = this.opts.createSocket ? this.opts.createSocket(url) : (new WebSocket(url) as unknown as WebSocketLike);
    } catch (e) {
      this.lastError = String(e);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      if (this.outbox.length) {
        const pending = this.outbox.splice(0);
        this.write({ kind: 'events', events: pending });
      }
      clearInterval(this.pingTimer);
      if (this.opts.pingMs > 0) this.pingTimer = setInterval(() => this.write({ kind: 'ping' }), this.opts.pingMs);
    };
    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onerror = () => {
      this.lastError = 'socket error';
    };
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev?.code === 4401 || ev?.code === 4403) {
        // auth rejected: don't hammer the server
        this.lastError = ev.reason || 'unauthorized';
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handle(data: unknown) {
    const msg = parseServerMessage(typeof data === 'string' ? data : String(data));
    if (!msg || !this.emit) return;
    switch (msg.kind) {
      case 'hello':
      case 'pong':
        this.clockOffset = msg.serverTime - Date.now();
        break;
      case 'snapshot':
        this.controls?.hydrate(msg.state);
        break;
      case 'events':
        for (const env of msg.envelopes) this.emit(env);
        break;
      case 'error':
        this.lastError = msg.message;
        break;
    }
  }

  private scheduleReconnect() {
    if (!this.emit) return;
    this.setStatus('reconnecting');
    const base = Math.min(this.opts.maxBackoffMs, this.opts.minBackoffMs * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private write(msg: ClientMessage) {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      /* socket closing; onclose will reconnect */
    }
  }

  private setStatus(s: ConnectionStatus) {
    if (s === this._status) return;
    this._status = s;
    for (const fn of this.listeners) fn(s);
  }
}
