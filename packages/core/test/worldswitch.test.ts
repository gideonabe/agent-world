import { describe, expect, it } from 'vitest';
import type { WorldConfig } from '@agent-viz/protocol';
import { createAgentWorldStore } from '../src';

const nav = { nodes: [{ id: 'a', position: [0, 0] as [number, number] }, { id: 'b', position: [3, 0] as [number, number] }], edges: [['a', 'b']] as [string, string][] };
const slot = { position: [0, 0] as [number, number], facing: 0 };

const worldA: WorldConfig = {
  id: 'a',
  name: 'A',
  island: { radius: 10, seed: 1 },
  homeStationId: 'plaza-a',
  navigation: nav,
  stations: [
    { id: 'lab-a', name: 'Lab', kind: 'research', accepts: ['research'], position: [5, 0], entryNode: 'a', slots: [slot] },
    { id: 'desk-a', name: 'Desk', kind: 'writing', accepts: ['writing'], position: [-5, 0], entryNode: 'b', slots: [slot] },
    { id: 'plaza-a', name: 'Plaza', kind: 'plaza', accepts: ['*'], position: [0, 0], entryNode: 'a', slots: [slot] },
  ],
};
const worldB: WorldConfig = {
  ...worldA,
  id: 'b',
  name: 'B',
  homeStationId: 'square-b',
  stations: [
    { id: 'library-b', name: 'Library', kind: 'research', accepts: ['research'], position: [5, 5], entryNode: 'a', slots: [slot, slot] },
    { id: 'cafe-b', name: 'Cafe', kind: 'writing', accepts: ['writing'], position: [-5, 5], entryNode: 'b', slots: [slot] },
    { id: 'square-b', name: 'Square', kind: 'plaza', accepts: ['*'], position: [0, 0], entryNode: 'a', slots: [slot] },
  ],
};

describe('setWorld', () => {
  it('moves active tasks to the matching station in the new world and keeps queues', () => {
    const store = createAgentWorldStore(worldA, { lifecycle: false });
    const s = store.getState();
    s.registerAgent({ id: 'r1', name: 'R1', kind: 'research' });
    s.registerAgent({ id: 'w1', name: 'W1', kind: 'writing' });
    s.registerAgent({ id: 'idle', name: 'Idle', kind: 'general' });
    const t1 = s.assignTask({ agentId: 'r1', kind: 'research', title: 'Read' });
    const queued = s.assignTask({ agentId: 'r1', kind: 'writing', title: 'Then write' });
    const t2 = s.assignTask({ agentId: 'w1', kind: 'writing', title: 'Write', stationId: 'desk-a' });
    s.reportProgress(t2, 0.3, 'Drafting', 'research'); // phase moved it to the lab
    s.moveAgent('idle', { stationId: 'plaza-a' });
    expect(store.getState().agents.w1!.stationId).toBe('lab-a');

    s.setWorld(worldB);
    const st = store.getState();
    expect(st.world.id).toBe('b');
    expect(st.agents.r1!.stationId).toBe('library-b');
    expect(st.agents.w1!.stationId).toBe('library-b'); // follows its phase, not the old station id
    expect(st.tasks[t1]!.stationId).toBe('library-b');
    expect(st.tasks[t2]!.stationId).toBe('library-b');
    expect(st.occupancy['library-b']).toEqual(['r1', 'w1']);
    expect(st.occupancy['lab-a']).toBeUndefined();
    expect(st.agents.r1!.taskQueue).toEqual([queued]);
    expect(st.agents.idle!.destination).toBeUndefined(); // plaza-a doesn't exist in world B
    expect(st.agents.idle!.stationId).toBeUndefined();

    // the queued task activates in the new world after the active one finishes
    s.completeTask(t1);
    expect(store.getState().agents.r1!.stationId).toBe('cafe-b');
  });

  it('keeps destinations that still exist and ignores a switch to the same world', () => {
    const store = createAgentWorldStore(worldA, { lifecycle: false });
    const s = store.getState();
    s.registerAgent({ id: 'x', name: 'X', kind: 'general' });
    s.moveAgent('x', { nodeId: 'b' });
    const before = store.getState();
    s.setWorld({ ...worldA });
    expect(store.getState()).toBe(before);
    s.setWorld(worldB);
    expect(store.getState().agents.x!.destination).toEqual({ nodeId: 'b' });
  });
});
