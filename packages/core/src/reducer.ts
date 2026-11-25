import { isTerminalStatus, type EventEnvelope, type Task, type WorldConfig } from '@agent-viz/protocol';
import { emptyStats, MAX_HISTORY, MAX_LOG, MAX_TASKS, type AgentState, type TaskOutcomeKind, type WorldState } from './types';
import { allocateSlot, pickStation, releaseSlot } from './stationRouter';

/**
 * Pure state transition — the ONLY place where events become state.
 *
 * `now` is the store's clock (receive time). Producer timestamps (`env.ts`)
 * stay in the log; internal timers use `now` so clock skew between a remote
 * producer and this process can't break settle/stall detection.
 *
 * Unknown agents/tasks are ignored (but still logged) so out-of-order or
 * foreign events never corrupt the world.
 */
export function applyEvent(state: WorldState, env: EventEnvelope, world: WorldConfig, now: number = env.ts): WorldState {
  let s = reduce(state, env, world, now);
  if (Object.keys(s.tasks).length > MAX_TASKS) s = pruneTasks(s, Math.floor(MAX_TASKS * 0.9));
  const log = s.log.length >= MAX_LOG ? s.log.slice(s.log.length - MAX_LOG + 1) : s.log.slice();
  log.push(env);
  return { ...s, log };
}

function reduce(state: WorldState, env: EventEnvelope, world: WorldConfig, now: number): WorldState {
  const e = env.event;

  switch (e.type) {
    case 'agent.registered': {
      const prev = state.agents[e.agent.id];
      const agent: AgentState = prev
        ? { ...prev, descriptor: e.agent, updatedAt: now }
        : {
            descriptor: e.agent,
            status: 'idle',
            statusSince: now,
            taskQueue: [],
            history: [],
            registeredAt: now,
            updatedAt: now,
            stats: emptyStats(),
          };
      return { ...state, agents: { ...state.agents, [e.agent.id]: agent } };
    }

    case 'agent.updated': {
      const prev = state.agents[e.agent.id];
      if (!prev) return state;
      const descriptor = {
        ...prev.descriptor,
        ...stripUndefined(e.agent),
        appearance: { ...prev.descriptor.appearance, ...e.agent.appearance },
      };
      return patchAgent(state, e.agent.id, { descriptor, updatedAt: now });
    }

    case 'agent.removed': {
      const prev = state.agents[e.agentId];
      if (!prev) return state;
      let next = releaseAgent(state, e.agentId);
      const tasks = { ...next.tasks };
      for (const id of [prev.currentTaskId, ...prev.taskQueue]) {
        const t = id ? tasks[id] : undefined;
        if (t && !isTerminalStatus(t.status)) {
          tasks[t.id] = { ...t, status: 'cancelled', error: 'Agent removed', endedAt: now, lastUpdateAt: now };
        }
      }
      const agents = { ...next.agents };
      delete agents[e.agentId];
      next = { ...next, agents, tasks };
      return next;
    }

    case 'agent.status': {
      const prev = state.agents[e.agentId];
      if (!prev) return state;
      let next = state;
      // Going idle/offline without an active task frees any held slot.
      if ((e.status === 'idle' || e.status === 'offline') && !activeTask(state, prev)) {
        next = releaseAgent(state, e.agentId);
      }
      return patchAgent(next, e.agentId, {
        ...statusPatch(prev, e.status, now),
        message: e.message ?? (e.status === 'idle' ? undefined : prev.message),
        updatedAt: now,
      });
    }

    case 'agent.destination': {
      const prev = state.agents[e.agentId];
      if (!prev) return state;
      const d = e.destination;
      if (d && 'stationId' in d && !world.stations.some((s) => s.id === d.stationId)) return state;
      if (d && 'nodeId' in d && !world.navigation.nodes.some((n) => n.id === d.nodeId)) return state;
      return patchAgent(state, e.agentId, { destination: d ?? undefined, updatedAt: now });
    }

    case 'task.assigned': {
      const agent = state.agents[e.task.agentId];
      if (!agent) return state;
      const existing = state.tasks[e.task.id];
      if (existing) {
        // Re-assigning a known id updates its descriptive fields, so out-of-order
        // producers can create a placeholder (metadata.placeholder = true) and fill
        // it in later. A placeholder never overwrites an existing task.
        if (existing.agentId !== e.task.agentId || isTerminalStatus(existing.status)) return state;
        if (e.task.metadata?.placeholder) return state;
        const metadata = { ...existing.metadata, ...e.task.metadata };
        delete metadata.placeholder;
        return patchTask(state, existing.id, { title: e.task.title, metadata, lastUpdateAt: now });
      }
      const task: Task = { ...e.task, status: 'queued', progress: 0, createdAt: now, lastUpdateAt: now };
      const next = { ...state, tasks: { ...state.tasks, [task.id]: task } };
      if (activeTask(state, agent)) {
        return patchAgent(next, agent.descriptor.id, {
          taskQueue: enqueue(next, agent.taskQueue, task),
          updatedAt: now,
        });
      }
      return activate(next, agent.descriptor.id, task.id, world, now);
    }

    case 'task.started': {
      const task = state.tasks[e.taskId];
      if (!task || isTerminalStatus(task.status)) return state;
      let next = ensureActive(state, task, world, now);
      next = patchTask(next, task.id, { status: 'in_progress', startedAt: now, stalled: false, lastUpdateAt: now });
      return patchAgentIfCurrent(next, task, { ...statusPatch(next.agents[task.agentId], 'working', now), updatedAt: now });
    }

    case 'task.progress': {
      const task = state.tasks[e.taskId];
      if (!task || isTerminalStatus(task.status)) return state;
      let next = ensureActive(state, task, world, now);
      if (e.phase && e.phase !== next.tasks[task.id]!.phase) next = reroute(next, task.id, e.phase, world, now);
      const cur = next.tasks[task.id]!;
      next = patchTask(next, task.id, {
        status: 'in_progress',
        progress: Math.max(cur.progress, e.progress),
        startedAt: cur.startedAt ?? now,
        stalled: false,
        lastUpdateAt: now,
        ...(e.message ? { message: e.message } : {}),
      });
      return patchAgentIfCurrent(next, task, {
        ...statusPatch(next.agents[task.agentId], 'working', now),
        updatedAt: now,
        ...(e.message ? { message: e.message } : {}),
      });
    }

    case 'task.stalled': {
      const task = state.tasks[e.taskId];
      if (!task || isTerminalStatus(task.status) || task.status === 'queued') return state;
      return patchTask(state, task.id, { stalled: true });
    }

    case 'task.completed':
      return finish(state, e.taskId, 'completed', world, now, { result: e.result });
    case 'task.failed':
      return finish(state, e.taskId, 'failed', world, now, { error: e.error });
    case 'task.cancelled':
      return finish(state, e.taskId, 'cancelled', world, now, { error: e.reason });
  }
}

// ---------------------------------------------------------------------------

function activeTask(state: WorldState, a: AgentState): Task | undefined {
  const t = a.currentTaskId ? state.tasks[a.currentTaskId] : undefined;
  return t && !isTerminalStatus(t.status) ? t : undefined;
}

function statusPatch(prev: AgentState | undefined, status: AgentState['status'], now: number): Partial<AgentState> {
  return prev && prev.status === status ? { status } : { status, statusSince: now };
}

/** Insert by priority (desc), FIFO within equal priority. */
function enqueue(state: WorldState, queue: string[], task: Task): string[] {
  const p = task.priority ?? 0;
  const idx = queue.findIndex((id) => (state.tasks[id]?.priority ?? 0) < p);
  const next = queue.slice();
  next.splice(idx < 0 ? next.length : idx, 0, task.id);
  return next;
}

/** Makes `taskId` the agent's active task: routes it to a station and claims a slot. */
function activate(state: WorldState, agentId: string, taskId: string, world: WorldConfig, now: number): WorldState {
  const agent = state.agents[agentId];
  const task = state.tasks[taskId];
  if (!agent || !task) return state;
  let next = releaseAgent(state, agentId);
  const station = pickStation(world, task.kind, next.occupancy, task.stationId);
  let slotIndex: number | undefined;
  if (station) {
    const alloc = allocateSlot(next.occupancy[station.id] ?? [], agentId);
    slotIndex = alloc.index;
    next = { ...next, occupancy: { ...next.occupancy, [station.id]: alloc.slots } };
  }
  next = patchTask(next, taskId, { status: 'assigned', stationId: station?.id, activatedAt: now, lastUpdateAt: now });
  return patchAgent(next, agentId, {
    ...statusPatch(next.agents[agentId], 'assigned', now),
    currentTaskId: taskId,
    taskQueue: next.agents[agentId]!.taskQueue.filter((id) => id !== taskId),
    stationId: station?.id,
    slotIndex,
    message: task.title,
    updatedAt: now,
  });
}

/** Moves an active task (and its agent) to a station matching `phase`. */
function reroute(state: WorldState, taskId: string, phase: string, world: WorldConfig, now: number): WorldState {
  const task = state.tasks[taskId];
  const agent = task ? state.agents[task.agentId] : undefined;
  if (!task || !agent || agent.currentTaskId !== taskId) return patchTask(state, taskId, { phase });
  let next = releaseAgent(state, agent.descriptor.id);
  const station = pickStation(world, phase, next.occupancy);
  let slotIndex: number | undefined;
  if (station) {
    const alloc = allocateSlot(next.occupancy[station.id] ?? [], agent.descriptor.id);
    slotIndex = alloc.index;
    next = { ...next, occupancy: { ...next.occupancy, [station.id]: alloc.slots } };
  }
  next = patchTask(next, taskId, { phase, stationId: station?.id, lastUpdateAt: now });
  return patchAgent(next, agent.descriptor.id, { stationId: station?.id, slotIndex, updatedAt: now });
}

/**
 * The producer is the source of truth: if it starts/progresses a queued task,
 * that task becomes active and the previous active task goes back to the
 * front of the queue.
 */
function ensureActive(state: WorldState, task: Task, world: WorldConfig, now: number): WorldState {
  const agent = state.agents[task.agentId];
  if (!agent || agent.currentTaskId === task.id) return state;
  let next = state;
  const current = activeTask(state, agent);
  if (current) {
    next = patchTask(next, current.id, { status: 'queued', lastUpdateAt: now });
    next = patchAgent(next, agent.descriptor.id, { taskQueue: [current.id, ...agent.taskQueue] });
  }
  return activate(next, agent.descriptor.id, task.id, world, now);
}

function finish(
  state: WorldState,
  taskId: string,
  result: TaskOutcomeKind,
  world: WorldConfig,
  now: number,
  extra: { result?: unknown; error?: string },
): WorldState {
  const task = state.tasks[taskId];
  if (!task || isTerminalStatus(task.status)) return state;
  let next = patchTask(state, task.id, {
    status: result,
    endedAt: now,
    lastUpdateAt: now,
    stalled: false,
    ...(result === 'completed' ? { progress: 1, result: extra.result } : {}),
    ...(extra.error !== undefined ? { error: extra.error } : {}),
  });
  const agent = next.agents[task.agentId];
  if (!agent) return next;

  const stats = {
    ...agent.stats,
    [result]: agent.stats[result] + 1,
    busyMs: agent.stats.busyMs + (agent.currentTaskId === task.id && task.activatedAt ? now - task.activatedAt : 0),
  };
  const history = [...agent.history, task.id].slice(-MAX_HISTORY);

  // A backlog task was cancelled/failed before it ever became active.
  if (agent.currentTaskId !== task.id) {
    return patchAgent(next, agent.descriptor.id, {
      taskQueue: agent.taskQueue.filter((id) => id !== task.id),
      history,
      stats,
      updatedAt: now,
    });
  }

  next = releaseAgent(next, agent.descriptor.id);
  const label = result === 'completed' ? 'Finished' : result === 'failed' ? 'Failed' : 'Cancelled';
  next = patchAgent(next, agent.descriptor.id, {
    currentTaskId: undefined,
    history,
    stats,
    lastOutcome: { taskId: task.id, result, at: now },
    message: `${label}: ${result === 'failed' && extra.error ? extra.error : task.title}`,
    updatedAt: now,
  });

  const nextId = next.agents[agent.descriptor.id]!.taskQueue[0];
  if (nextId) return activate(next, agent.descriptor.id, nextId, world, now);

  const status = result === 'cancelled' ? 'idle' : result;
  return patchAgent(next, agent.descriptor.id, statusPatch(next.agents[agent.descriptor.id], status, now));
}

/** Drops the oldest terminal tasks so long-running sessions stay bounded. */
export function pruneTasks(state: WorldState, keep: number): WorldState {
  const all = Object.values(state.tasks);
  const excess = all.length - keep;
  if (excess <= 0) return state;
  const victims = all
    .filter((t) => isTerminalStatus(t.status))
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
    .slice(0, excess);
  if (!victims.length) return state;
  const gone = new Set(victims.map((t) => t.id));
  const tasks = { ...state.tasks };
  for (const id of gone) delete tasks[id];
  const agents = { ...state.agents };
  for (const [id, a] of Object.entries(agents)) {
    if (a.history.some((h) => gone.has(h))) agents[id] = { ...a, history: a.history.filter((h) => !gone.has(h)) };
  }
  return { ...state, tasks, agents };
}

function patchAgent(state: WorldState, id: string, patch: Partial<AgentState>): WorldState {
  const prev = state.agents[id];
  if (!prev) return state;
  return { ...state, agents: { ...state.agents, [id]: { ...prev, ...patch } } };
}

function patchAgentIfCurrent(state: WorldState, task: Task, patch: Partial<AgentState>): WorldState {
  const a = state.agents[task.agentId];
  if (!a || a.currentTaskId !== task.id) return state;
  return patchAgent(state, task.agentId, patch);
}

function patchTask(state: WorldState, id: string, patch: Partial<Task>): WorldState {
  const prev = state.tasks[id];
  if (!prev) return state;
  return { ...state, tasks: { ...state.tasks, [id]: { ...prev, ...patch } } };
}

/** Frees the agent's station slot and clears station fields. */
function releaseAgent(state: WorldState, agentId: string): WorldState {
  const a = state.agents[agentId];
  if (!a?.stationId) return state;
  const slots = state.occupancy[a.stationId] ?? [];
  const occupancy = { ...state.occupancy, [a.stationId]: releaseSlot(slots, agentId) };
  return patchAgent({ ...state, occupancy }, agentId, { stationId: undefined, slotIndex: undefined });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
