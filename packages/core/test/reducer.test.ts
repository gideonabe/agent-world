import { describe, expect, it } from 'vitest';
import { createEnvelope, type AgentWorldEvent, type WorldConfig } from '@agent-viz/protocol';
import { applyEvent, emptyState, pickStation, createAgentWorldStore, type WorldState } from '../src';

const world: WorldConfig = {
  id: 't',
  name: 'Test',
  island: { radius: 10, seed: 1 },
  homeStationId: 'plaza',
  navigation: { nodes: [{ id: 'a', position: [0, 0] }], edges: [] },
  stations: [
    { id: 'lab', name: 'Lab', kind: 'research', accepts: ['research'], position: [5, 0], entryNode: 'a', slots: [{ position: [0, 0], facing: 0 }] },
    { id: 'plaza', name: 'Plaza', kind: 'plaza', accepts: ['*'], position: [0, 0], entryNode: 'a', slots: [{ position: [0, 0], facing: 0 }, { position: [1, 0], facing: 0 }] },
  ],
};

const run = (events: AgentWorldEvent[], start: WorldState = emptyState()) =>
  events.reduce((s, e, i) => applyEvent(s, createEnvelope(e, undefined, 1000 + i), world), start);

const reg = (id: string): AgentWorldEvent => ({ type: 'agent.registered', agent: { id, name: id, kind: 'research' } });

describe('reducer', () => {
  it('registers agents as idle', () => {
    const s = run([reg('a1')]);
    expect(s.agents.a1?.status).toBe('idle');
    expect(s.log).toHaveLength(1);
  });

  it('routes a task to the matching station and allocates a slot', () => {
    const s = run([reg('a1'), { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } }]);
    expect(s.agents.a1).toMatchObject({ status: 'assigned', stationId: 'lab', slotIndex: 0, currentTaskId: 't1' });
    expect(s.occupancy.lab).toEqual(['a1']);
  });

  it('queues agents beyond station capacity', () => {
    const s = run([
      reg('a1'),
      reg('a2'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } },
      { type: 'task.assigned', task: { id: 't2', agentId: 'a2', kind: 'research', title: 'y' } },
    ]);
    expect(s.agents.a2?.slotIndex).toBe(1); // queue position (lab has 1 slot)
  });

  it('falls back to wildcard stations for unknown kinds', () => {
    expect(pickStation(world, 'mystery', {})?.id).toBe('plaza');
  });

  it('tracks progress, completion and frees the slot', () => {
    const s = run([
      reg('a1'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } },
      { type: 'task.started', taskId: 't1' },
      { type: 'task.progress', taskId: 't1', progress: 0.5, message: 'half' },
    ]);
    expect(s.agents.a1?.status).toBe('working');
    expect(s.tasks.t1).toMatchObject({ status: 'in_progress', progress: 0.5, message: 'half' });

    const done = run([{ type: 'task.completed', taskId: 't1' }], s);
    expect(done.agents.a1).toMatchObject({ status: 'completed', stats: { completed: 1, failed: 0 } });
    expect(done.agents.a1?.stationId).toBeUndefined();
    expect(done.occupancy.lab).toEqual([]);
    expect(done.tasks.t1?.progress).toBe(1);
  });

  it('records failures', () => {
    const s = run([
      reg('a1'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } },
      { type: 'task.failed', taskId: 't1', error: 'boom' },
    ]);
    expect(s.agents.a1).toMatchObject({ status: 'failed', stats: { completed: 0, failed: 1 } });
    expect(s.tasks.t1).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('ignores events for unknown agents/tasks and terminal tasks', () => {
    const s = run([
      { type: 'task.assigned', task: { id: 't1', agentId: 'ghost', kind: 'research', title: 'x' } },
      { type: 'task.progress', taskId: 'nope', progress: 0.3 },
    ]);
    expect(s.tasks).toEqual({});
    const s2 = run([
      reg('a1'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } },
      { type: 'task.completed', taskId: 't1' },
      { type: 'task.progress', taskId: 't1', progress: 0.2 },
    ]);
    expect(s2.tasks.t1?.status).toBe('completed');
    expect(s2.agents.a1?.stats.completed).toBe(1);
  });

  it('removing an agent cancels its active task and frees its slot', () => {
    const s = run([
      reg('a1'),
      { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } },
      { type: 'agent.removed', agentId: 'a1' },
    ]);
    expect(s.agents.a1).toBeUndefined();
    expect(s.tasks.t1?.status).toBe("cancelled");
    expect(s.occupancy.lab).toEqual([]);
  });
});

describe('store', () => {
  it('rejects invalid envelopes on ingest', () => {
    const store = createAgentWorldStore(world);
    expect(store.getState().ingest({ nope: true })).toBe(false);
    expect(store.getState().ingest(createEnvelope(reg('a1')))).toBe(true);
    expect(store.getState().agents.a1).toBeDefined();
  });
});
