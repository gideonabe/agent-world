import { describe, expect, it } from 'vitest';
import { createEnvelope, type AgentWorldEvent, type WorldConfig } from '@agent-world/protocol';
import {
  applyEvent,
  createAgentWorldStore,
  DEFAULT_LIFECYCLE,
  dueLifecycleEvents,
  emptyState,
  pruneTasks,
  selectAgentMetrics,
  selectHistory,
  selectQueue,
  selectStationLoad,
  selectWorldMetrics,
  type WorldState,
} from '../src';

const world: WorldConfig = {
  id: 't',
  name: 'Test',
  island: { radius: 10, seed: 1 },
  homeStationId: 'plaza',
  navigation: { nodes: [{ id: 'a', position: [0, 0] }, { id: 'b', position: [3, 0] }], edges: [['a', 'b']] },
  stations: [
    { id: 'lab', name: 'Lab', kind: 'research', accepts: ['research'], position: [5, 0], entryNode: 'a', slots: [{ position: [0, 0], facing: 0 }] },
    { id: 'desk', name: 'Desk', kind: 'writing', accepts: ['writing'], position: [-5, 0], entryNode: 'b', slots: [{ position: [0, 0], facing: 0 }] },
    { id: 'plaza', name: 'Plaza', kind: 'plaza', accepts: ['*'], position: [0, 0], entryNode: 'a', slots: [{ position: [0, 0], facing: 0 }] },
  ],
};

let clock = 1000;
const run = (events: AgentWorldEvent[], start: WorldState = emptyState()) =>
  events.reduce((s, e) => {
    clock += 100;
    return applyEvent(s, createEnvelope(e, undefined, clock), world, clock);
  }, start);

const reg: AgentWorldEvent = { type: 'agent.registered', agent: { id: 'a1', name: 'A', kind: 'research' } };
const assign = (id: string, kind = 'research', priority?: number): AgentWorldEvent => ({
  type: 'task.assigned',
  task: { id, agentId: 'a1', kind, title: id, ...(priority !== undefined ? { priority } : {}) },
});

describe('task queue', () => {
  it('queues tasks for a busy agent, ordered by priority then FIFO', () => {
    const s = run([reg, assign('t1'), assign('t2'), assign('t3', 'research', 5), assign('t4')]);
    expect(s.agents.a1?.currentTaskId).toBe('t1');
    expect(s.agents.a1?.taskQueue).toEqual(['t3', 't2', 't4']);
    expect(s.tasks.t2?.status).toBe('queued');
    expect(s.tasks.t1?.status).toBe('assigned');
    expect(selectQueue(s, 'a1').map((t) => t.id)).toEqual(['t3', 't2', 't4']);
  });

  it('treats a duplicate task id as an update, never a second task', () => {
    const s = run([
      reg,
      assign('t1'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'Better title' } },
    ]);
    expect(s.agents.a1?.taskQueue).toEqual([]);
    expect(s.tasks.t1?.title).toBe('Better title');
    const done = run([{ type: 'task.completed', taskId: 't1' }, { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'zombie' } }], s);
    expect(done.tasks.t1?.title).toBe('Better title'); // finished tasks are immutable
    const ph = run([{ type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: '…', metadata: { placeholder: true } } }], s);
    expect(ph.tasks.t1?.title).toBe('Better title'); // placeholders never overwrite
  });

  it('activates the next queued task (and its station) when the current one finishes', () => {
    const s = run([reg, assign('t1'), assign('t2', 'writing'), { type: 'task.completed', taskId: 't1' }]);
    const a = s.agents.a1!;
    expect(a.currentTaskId).toBe('t2');
    expect(a.status).toBe('assigned');
    expect(a.stationId).toBe('desk');
    expect(a.lastOutcome).toMatchObject({ taskId: 't1', result: 'completed' });
    expect(s.occupancy.lab).toEqual([]);
    expect(s.occupancy.desk).toEqual(['a1']);
  });

  it('promotes a queued task if the producer starts it out of order', () => {
    const s = run([reg, assign('t1'), assign('t2'), { type: 'task.started', taskId: 't2' }]);
    expect(s.agents.a1?.currentTaskId).toBe('t2');
    expect(s.agents.a1?.taskQueue).toEqual(['t1']);
    expect(s.tasks.t1?.status).toBe('queued');
    expect(s.tasks.t2?.status).toBe('in_progress');
  });
});

describe('multi-step tasks (phase)', () => {
  it('re-routes the agent to a station matching each new phase', () => {
    let s = run([reg, assign('t1'), { type: 'task.progress', taskId: 't1', progress: 0.1, phase: 'writing' }]);
    expect(s.agents.a1?.stationId).toBe('desk');
    expect(s.tasks.t1).toMatchObject({ phase: 'writing', stationId: 'desk' });
    expect(s.occupancy.lab).toEqual([]);
    s = run([{ type: 'task.progress', taskId: 't1', progress: 0.2, phase: 'writing' }], s); // same phase: no move
    expect(s.occupancy.desk).toEqual(['a1']);
    s = run([{ type: 'task.progress', taskId: 't1', progress: 0.3, phase: 'mystery' }], s); // unknown → wildcard
    expect(s.agents.a1?.stationId).toBe('plaza');
    expect(s.occupancy.desk).toEqual([]);
  });
});

describe('cancellation', () => {
  it('cancelling a queued task removes it from the backlog without a reaction', () => {
    const s = run([reg, assign('t1'), assign('t2'), { type: 'task.cancelled', taskId: 't2', reason: 'nope' }]);
    expect(s.agents.a1?.taskQueue).toEqual([]);
    expect(s.agents.a1?.currentTaskId).toBe('t1');
    expect(s.agents.a1?.lastOutcome).toBeUndefined();
    expect(s.tasks.t2).toMatchObject({ status: 'cancelled', error: 'nope' });
    expect(s.agents.a1?.stats.cancelled).toBe(1);
  });

  it('cancelling the active task frees the slot and makes the agent idle', () => {
    const s = run([reg, assign('t1'), { type: 'task.cancelled', taskId: 't1' }]);
    expect(s.agents.a1).toMatchObject({ status: 'idle', currentTaskId: undefined, lastOutcome: { result: 'cancelled' } });
    expect(s.occupancy.lab).toEqual([]);
  });

  it('removing an agent cancels its active and queued tasks', () => {
    const s = run([reg, assign('t1'), assign('t2'), { type: 'agent.removed', agentId: 'a1' }]);
    expect(s.tasks.t1?.status).toBe('cancelled');
    expect(s.tasks.t2?.status).toBe('cancelled');
  });
});

describe('stalls, destinations, history', () => {
  it('marks stalled tasks and clears the flag on progress', () => {
    let s = run([reg, assign('t1'), { type: 'task.started', taskId: 't1' }, { type: 'task.stalled', taskId: 't1' }]);
    expect(s.tasks.t1?.stalled).toBe(true);
    s = run([{ type: 'task.progress', taskId: 't1', progress: 0.4 }], s);
    expect(s.tasks.t1?.stalled).toBe(false);
  });

  it('sets and clears destinations, rejecting unknown targets', () => {
    let s = run([reg, { type: 'agent.destination', agentId: 'a1', destination: { stationId: 'desk' } }]);
    expect(s.agents.a1?.destination).toEqual({ stationId: 'desk' });
    s = run([{ type: 'agent.destination', agentId: 'a1', destination: { stationId: 'nowhere' } }], s);
    expect(s.agents.a1?.destination).toEqual({ stationId: 'desk' });
    s = run([{ type: 'agent.destination', agentId: 'a1', destination: null }], s);
    expect(s.agents.a1?.destination).toBeUndefined();
  });

  it('records history newest-first and busy time', () => {
    const s = run([reg, assign('t1'), { type: 'task.completed', taskId: 't1' }, assign('t2'), { type: 'task.failed', taskId: 't2', error: 'x' }]);
    expect(selectHistory(s, 'a1').map((t) => t.id)).toEqual(['t2', 't1']);
    const m = selectAgentMetrics(s, 'a1')!;
    expect(m).toMatchObject({ completed: 1, failed: 1, successRate: 0.5 });
    expect(m.avgTaskMs).toBeGreaterThan(0);
  });

  it('prunes oldest finished tasks', () => {
    let s = run([reg]);
    for (let i = 0; i < 6; i++) s = run([assign(`t${i}`), { type: 'task.completed', taskId: `t${i}` }], s);
    s = pruneTasks(s, 3);
    expect(Object.keys(s.tasks).sort()).toEqual(['t3', 't4', 't5']);
    expect(s.agents.a1?.history).toEqual(['t3', 't4', 't5']);
  });
});

describe('lifecycle monitor', () => {
  it('settles finished agents and flags silent tasks', () => {
    const s = run([
      reg,
      { type: 'agent.registered', agent: { id: 'a2', name: 'B', kind: 'writing' } },
      assign('t1'),
      { type: 'task.completed', taskId: 't1' },
      { type: 'task.assigned', task: { id: 't9', agentId: 'a2', kind: 'writing', title: 'w' } },
    ]);
    expect(dueLifecycleEvents(s, clock, DEFAULT_LIFECYCLE)).toEqual([]);
    const later = dueLifecycleEvents(s, clock + 60_000, DEFAULT_LIFECYCLE);
    expect(later).toContainEqual({ type: 'agent.status', agentId: 'a1', status: 'idle' });
    expect(later).toContainEqual({ type: 'task.stalled', taskId: 't9' });
  });

  it('runs on the store timer with an injectable clock', async () => {
    let t = 0;
    const store = createAgentWorldStore(world, { now: () => t, lifecycle: { settleMs: 50, staleMs: 0, intervalMs: 10 } });
    const st = store.getState();
    st.registerAgent({ id: 'a1', name: 'A', kind: 'research' });
    const id = st.assignTask({ agentId: 'a1', kind: 'research', title: 'x' });
    st.completeTask(id);
    expect(store.getState().agents.a1?.status).toBe('completed');
    t = 100;
    await new Promise((r) => setTimeout(r, 40));
    expect(store.getState().agents.a1?.status).toBe('idle');
    expect(store.getState().log.at(-1)?.source).toBe('system');
    store.getState().destroy();
  });
});

describe('commands + selectors', () => {
  it('assignTask generates ids; retryTask re-assigns with lineage', () => {
    const store = createAgentWorldStore(world, { lifecycle: false });
    const st = store.getState();
    st.registerAgent({ id: 'a1', name: 'A', kind: 'research' });
    const id = st.assignTask({ agentId: 'a1', kind: 'research', title: 'x' });
    expect(id).toMatch(/^task-/);
    st.failTask(id, 'boom');
    const retry = store.getState().retryTask(id)!;
    const t = store.getState().tasks[retry]!;
    expect(t.metadata).toMatchObject({ retryOf: id, attempt: 2 });
    expect(store.getState().agents.a1?.currentTaskId).toBe(retry);
    expect(store.getState().retryTask('missing')).toBeUndefined();
  });

  it('world metrics and station load', () => {
    const store = createAgentWorldStore(world, { lifecycle: false });
    const st = store.getState();
    st.registerAgent({ id: 'a1', name: 'A', kind: 'research' });
    st.registerAgent({ id: 'a2', name: 'B', kind: 'research' });
    st.assignTask({ agentId: 'a1', kind: 'research', title: 'x' });
    st.assignTask({ agentId: 'a2', kind: 'research', title: 'y' });
    st.assignTask({ agentId: 'a2', kind: 'research', title: 'z' });
    const m = selectWorldMetrics(store.getState());
    expect(m).toMatchObject({ agents: 2, activeTasks: 2, queuedTasks: 1, successRate: null });
    const lab = selectStationLoad(store.getState()).find((l) => l.station.id === 'lab')!;
    expect(lab).toMatchObject({ occupied: 1, capacity: 1, waiting: 1 });
  });
});
