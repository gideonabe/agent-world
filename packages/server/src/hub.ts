import { WebSocket } from 'ws';
import {
  AgentWorldEventSchema,
  createEnvelope,
  parseEnvelope,
  type AgentWorldEvent,
  type EventEnvelope,
  type ServerMessage,
  type WorldConfig,
} from '@agent-world/protocol';
import {
  createAgentWorldStore,
  MockEventSource,
  selectWorldMetrics,
  type AgentWorldStore,
  type LifecycleOptions,
  type MockSourceOptions,
} from '@agent-world/core';
import { SnapshotStore } from './persistence';

export interface IngestResult {
  accepted: number;
  rejected: number;
  errors: string[];
}

export interface HubOptions {
  projectId: string;
  world: WorldConfig;
  batchMs: number;
  lifecycle?: LifecycleOptions;
  /** File to persist state to; omitted = memory only. */
  persistFile?: string;
  mock?: MockSourceOptions;
}

interface Viewer {
  ws: WebSocket;
  canWrite: boolean;
}

/**
 * One project's live world: an authoritative store, its viewers, an optional
 * simulator and optional persistence. Broadcasts are coalesced into one
 * frame per `batchMs`.
 */
export class ProjectHub {
  readonly store: AgentWorldStore;
  readonly mock: MockEventSource | undefined;
  private viewers = new Set<Viewer>();
  private pending: EventEnvelope[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshots: SnapshotStore | undefined;

  constructor(private readonly opts: HubOptions) {
    this.store = createAgentWorldStore(opts.world, {
      lifecycle: opts.lifecycle ?? {},
      onEvent: (env) => {
        this.pending.push(env);
        this.flushTimer ??= setTimeout(() => this.flush(), opts.batchMs);
        this.snapshots?.markDirty();
      },
    });
    if (opts.persistFile) {
      this.snapshots = new SnapshotStore(opts.persistFile, () => this.store.getState().snapshot());
      const saved = this.snapshots.load();
      if (saved) this.store.getState().hydrate(saved);
    }
    if (opts.mock) {
      this.mock = new MockEventSource({ ...opts.mock, projectId: opts.projectId });
      this.store.getState().connect(this.mock);
    }
  }

  get projectId() {
    return this.opts.projectId;
  }

  get worldId() {
    return this.opts.world.id;
  }

  viewerCount() {
    return this.viewers.size;
  }

  metrics() {
    return selectWorldMetrics(this.store.getState());
  }

  /** Validates + applies events from any producer. */
  ingest(items: unknown[], source: string): IngestResult {
    let accepted = 0;
    const errors: string[] = [];
    items.forEach((item, i) => {
      let env: EventEnvelope | null = null;
      if (item && typeof item === 'object' && 'event' in item) {
        env = parseEnvelope(item);
        // the server re-stamps time so producers' clocks can't reorder history
        if (env) env = { ...env, ts: Date.now(), projectId: this.projectId, source: env.source ?? source };
      } else {
        const r = AgentWorldEventSchema.safeParse(item);
        if (r.success) env = createEnvelope(r.data, this.projectId, Date.now(), source);
      }
      if (!env) {
        errors.push(`item ${i}: invalid event`);
        return;
      }
      if (!this.routeToMock(env.event)) this.store.getState().dispatch(env);
      accepted++;
    });
    return { accepted, rejected: errors.length, errors: errors.slice(0, 10) };
  }

  addViewer(ws: WebSocket, canWrite: boolean, onEvents: (v: { canWrite: boolean }, data: string) => void) {
    const v: Viewer = { ws, canWrite };
    this.viewers.add(v);
    this.send(ws, { kind: 'hello', version: 1, serverTime: Date.now(), projectId: this.projectId, worldId: this.worldId });
    this.send(ws, { kind: 'snapshot', serverTime: Date.now(), state: this.store.getState().snapshot() });
    ws.on('message', (data) => onEvents(v, data.toString()));
    const drop = () => this.viewers.delete(v);
    ws.on('close', drop);
    ws.on('error', drop);
  }

  send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  close(code = 1001, reason = 'server shutting down') {
    this.mock?.stop();
    clearTimeout(this.flushTimer);
    this.flush();
    this.snapshots?.flush();
    this.store.getState().destroy();
    for (const v of this.viewers) v.ws.close(code, reason);
    this.viewers.clear();
  }

  private flush() {
    this.flushTimer = undefined;
    if (!this.pending.length) return;
    const frame = JSON.stringify({ kind: 'events', envelopes: this.pending } satisfies ServerMessage);
    this.pending = [];
    for (const v of this.viewers) if (v.ws.readyState === WebSocket.OPEN) v.ws.send(frame);
  }

  /** Commands aimed at simulated agents are executed by the simulator. */
  private routeToMock(e: AgentWorldEvent): boolean {
    const mock = this.mock;
    if (!mock) return false;
    switch (e.type) {
      case 'task.assigned':
        if (!mock.owns(e.task.agentId)) return false;
        mock.assign(e.task.agentId, e.task.kind, e.task.title, {
          ...(e.task.priority !== undefined ? { priority: e.task.priority } : {}),
          ...(e.task.metadata ? { metadata: e.task.metadata } : {}),
        });
        return true;
      case 'task.cancelled':
        return mock.cancel(e.taskId, e.reason);
      case 'agent.removed':
        if (!mock.owns(e.agentId)) return false;
        mock.remove(e.agentId);
        return true;
      default:
        return false;
    }
  }
}
