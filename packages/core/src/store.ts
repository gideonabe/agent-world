import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  createEnvelope,
  isTerminalStatus,
  parseEnvelope,
  type AgentDescriptor,
  type AgentDestination,
  type AgentStatus,
  type AgentWorldEvent,
  type EventEnvelope,
  type TaskInput,
  type WorldConfig,
  type WorldSnapshot,
} from '@agent-world/protocol';
import { applyEvent } from './reducer';
import { emptyState, type WorldState } from './types';
import type { AgentEventSource } from './sources/types';
import { DEFAULT_LIFECYCLE, dueLifecycleEvents, type LifecycleOptions } from './lifecycle';

export interface AgentWorldStoreOptions {
  /** Settle / stall detection. Pass `false` to disable timers entirely. */
  lifecycle?: LifecycleOptions | false;
  /** Clock used for internal timestamps (injectable for tests). */
  now?: () => number;
  /** Called for every applied envelope (e.g. to forward to a server). */
  onEvent?: (env: EventEnvelope) => void;
}

/** Management commands. Each one only emits protocol events, so local
 *  control and remote producers go through the exact same path. */
export interface AgentCommands {
  registerAgent: (agent: AgentDescriptor) => void;
  removeAgent: (agentId: string) => void;
  setAgentStatus: (agentId: string, status: AgentStatus, message?: string) => void;
  /** Where the agent rests when idle; null = roam freely. */
  moveAgent: (agentId: string, destination: AgentDestination | null) => void;
  /** Assigns a task (queued if the agent is busy). Returns the task id. */
  assignTask: (task: Omit<TaskInput, 'id'> & { id?: string }) => string;
  startTask: (taskId: string) => void;
  reportProgress: (taskId: string, progress: number, message?: string, phase?: string) => void;
  completeTask: (taskId: string, result?: unknown) => void;
  failTask: (taskId: string, error: string) => void;
  cancelTask: (taskId: string, reason?: string) => void;
  /** Re-assigns a finished (usually failed) task as a new task. Returns the new id. */
  retryTask: (taskId: string) => string | undefined;
}

export interface AgentWorldStoreState extends WorldState, AgentCommands {
  world: WorldConfig;
  /** Apply a validated envelope. */
  dispatch: (env: EventEnvelope) => void;
  /** Convenience: wrap a bare event in an envelope and apply it. */
  emit: (event: AgentWorldEvent, source?: string) => void;
  /** Validate untrusted input, then apply. Returns false when rejected. */
  ingest: (raw: unknown) => boolean;
  /** Connects an event source; returns a disconnect function. */
  connect: (source: AgentEventSource) => () => void;
  reset: () => void;
  /** Replace agents/tasks/occupancy with an authoritative snapshot (clears the log). */
  hydrate: (snapshot: WorldSnapshot) => void;
  /** Serializable copy of the current state, for sending to late joiners. */
  snapshot: () => WorldSnapshot;
  /** Stops lifecycle timers. */
  destroy: () => void;
}

export type AgentWorldStore = StoreApi<AgentWorldStoreState>;

let idSeq = 0;
export function generateTaskId() {
  idSeq = (idSeq + 1) % 1e9;
  return `task-${Date.now().toString(36)}-${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Framework-agnostic store. Use `zustand`'s `useStore(store, selector)` in
 * React, or `store.subscribe` anywhere else (Node, workers, tests).
 */
export function createAgentWorldStore(world: WorldConfig, options: AgentWorldStoreOptions = {}): AgentWorldStore {
  const now = options.now ?? Date.now;

  const store = createStore<AgentWorldStoreState>()((set, get) => {
    const emit = (event: AgentWorldEvent, source = 'local') => get().dispatch(createEnvelope(event, undefined, now(), source));
    return {
      ...emptyState(),
      world,
      dispatch: (env) => {
        set((s) => applyEvent(s, env, s.world, now()));
        options.onEvent?.(env);
      },
      emit,
      ingest: (raw) => {
        const env = parseEnvelope(raw);
        if (!env) return false;
        get().dispatch(env);
        return true;
      },
      connect: (source) => {
        source.start((env) => get().dispatch(env), { hydrate: (snap) => get().hydrate(snap) });
        return () => source.stop();
      },
      reset: () => set({ ...emptyState() }),
      hydrate: (snap) =>
        set({
          agents: snap.agents as WorldState["agents"],
          tasks: snap.tasks as WorldState["tasks"],
          occupancy: snap.occupancy,
          log: [],
        }),
      snapshot: () => {
        const { agents, tasks, occupancy } = get();
        return { agents, tasks, occupancy };
      },
      destroy: () => stopTimer(),

      registerAgent: (agent) => emit({ type: 'agent.registered', agent }),
      removeAgent: (agentId) => emit({ type: 'agent.removed', agentId }),
      setAgentStatus: (agentId, status, message) => emit({ type: 'agent.status', agentId, status, ...(message ? { message } : {}) }),
      moveAgent: (agentId, destination) => emit({ type: 'agent.destination', agentId, destination }),
      assignTask: (task) => {
        const id = task.id ?? generateTaskId();
        emit({ type: 'task.assigned', task: { ...task, id } });
        return id;
      },
      startTask: (taskId) => emit({ type: 'task.started', taskId }),
      reportProgress: (taskId, progress, message, phase) =>
        emit({
          type: 'task.progress',
          taskId,
          progress: Math.min(1, Math.max(0, progress)),
          ...(message ? { message } : {}),
          ...(phase ? { phase } : {}),
        }),
      completeTask: (taskId, result) => emit({ type: 'task.completed', taskId, result }),
      failTask: (taskId, error) => emit({ type: 'task.failed', taskId, error }),
      cancelTask: (taskId, reason) => emit({ type: 'task.cancelled', taskId, ...(reason ? { reason } : {}) }),
      retryTask: (taskId) => {
        const t = get().tasks[taskId];
        if (!t || !isTerminalStatus(t.status) || !get().agents[t.agentId]) return undefined;
        const root = (t.metadata?.retryOf as string | undefined) ?? t.id;
        const attempt = ((t.metadata?.attempt as number | undefined) ?? 1) + 1;
        return get().assignTask({
          agentId: t.agentId,
          kind: t.kind,
          title: t.title,
          ...(t.stationId ? { stationId: t.stationId } : {}),
          ...(t.priority !== undefined ? { priority: t.priority } : {}),
          metadata: { ...t.metadata, retryOf: root, attempt },
        });
      },
    };
  });

  // Lifecycle monitor: one cheap interval, no per-agent timers.
  let timer: ReturnType<typeof setInterval> | undefined;
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  if (options.lifecycle !== false) {
    const opts = { ...DEFAULT_LIFECYCLE, ...options.lifecycle };
    timer = setInterval(() => {
      const due = dueLifecycleEvents(store.getState(), now(), opts);
      for (const ev of due) store.getState().emit(ev, 'system');
    }, opts.intervalMs);
    (timer as { unref?: () => void }).unref?.();
  }

  return store;
}
