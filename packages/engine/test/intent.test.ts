import { describe, expect, it } from 'vitest';
import type { AgentState } from '@agent-world/core';
import type { Task } from '@agent-world/protocol';
import { NavGraph } from '../src/navigation/navGraph';
import { intentFor, intentKey, reactionFor } from '../src/characters/intent';
import { meadowIsland } from '../src/presets/meadowIsland';

const nav = new NavGraph(meadowIsland.navigation);
const base: AgentState = {
  descriptor: { id: 'a1', name: 'A', kind: 'research' },
  status: 'idle',
  statusSince: 0,
  taskQueue: [],
  history: [],
  registeredAt: 0,
  updatedAt: 0,
  stats: { completed: 0, failed: 0, cancelled: 0, busyMs: 0 },
};
const task: Task = { id: 't1', agentId: 'a1', kind: 'research', title: 'x', status: 'in_progress', progress: 0.2, createdAt: 0, lastUpdateAt: 0 };

describe('intentFor', () => {
  it('idle agents wander', () => {
    expect(intentFor(base, undefined, meadowIsland, nav).type).toBe('wander');
  });

  it('working agents go to their station slot with the station work clip', () => {
    const i = intentFor({ ...base, status: 'working', stationId: 'research-lab', slotIndex: 1 }, task, meadowIsland, nav);
    expect(i).toMatchObject({ type: 'station', slotIndex: 1, workClip: 'read' });
  });

  it('stalled tasks switch to the think clip', () => {
    const i = intentFor({ ...base, status: 'working', stationId: 'research-lab', slotIndex: 0 }, { ...task, stalled: true }, meadowIsland, nav);
    expect(i).toMatchObject({ type: 'station', workClip: 'think' });
  });

  it('idle agents with a destination go there', () => {
    expect(intentFor({ ...base, destination: { stationId: 'code-forge' } }, undefined, meadowIsland, nav)).toMatchObject({ type: 'goto', nodeId: 'ne' });
    expect(intentFor({ ...base, destination: { nodeId: 'n-look' } }, undefined, meadowIsland, nav)).toMatchObject({ type: 'goto', nodeId: 'n-look' });
  });

  it('completed/failed agents fall back to their resting behaviour (reactions are separate)', () => {
    expect(intentFor({ ...base, status: 'completed' }, undefined, meadowIsland, nav).type).toBe('wander');
    expect(reactionFor('failed')).toBe('fail');
    expect(reactionFor('cancelled')).toBe('cancel');
  });

  it('intentKey changes only when behaviour-relevant state changes', () => {
    const k = intentKey(base, undefined);
    expect(intentKey({ ...base, message: 'hi', updatedAt: 99 }, undefined)).toBe(k);
    expect(intentKey({ ...base, destination: { nodeId: 'n' } }, undefined)).not.toBe(k);
  });
});
