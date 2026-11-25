import type { AgentState, TaskOutcomeKind } from '@agent-world/core';
import type { Task, Vec2, WorldConfig } from '@agent-world/protocol';
import type { NavGraph } from '../navigation/navGraph';
import { hashString, stationToWorld } from '../math';
import type { MotionIntent, Reaction } from './agentMotion';

/**
 * The bridge between logical state (core) and behaviour (engine).
 * Pure function: same agent state in, same intent out.
 */
export function intentFor(agent: AgentState, task: Task | undefined, world: WorldConfig, nav: NavGraph): MotionIntent {
  switch (agent.status) {
    case 'assigned':
    case 'working': {
      const station = world.stations.find((s) => s.id === agent.stationId);
      // A stalled task shows as "thinking" instead of busy work.
      const workClip = task?.stalled ? 'think' : (station?.workAnimation ?? 'default');
      if (station && agent.slotIndex !== undefined) {
        return { type: 'station', station, slotIndex: agent.slotIndex, workClip, urgent: false };
      }
      return { type: 'workHere', workClip };
    }
    case 'offline':
      return { type: 'hold' };
    default:
      return destinationIntent(agent, world, nav) ?? { type: 'wander' };
  }
}

/** Idle agents with a destination rest there instead of wandering. */
function destinationIntent(agent: AgentState, world: WorldConfig, nav: NavGraph): MotionIntent | undefined {
  const d = agent.destination;
  if (!d) return undefined;
  const jitter = ((hashString(agent.descriptor.id) % 1000) / 1000 - 0.5) * 1.6;
  if ('stationId' in d) {
    const s = world.stations.find((st) => st.id === d.stationId);
    if (!s) return undefined;
    // stand along the front edge of the station, facing it
    const target: Vec2 = stationToWorld(s, [jitter, (s.radius ?? 2.5) * 0.85]);
    return { type: 'goto', target, nodeId: s.entryNode, facing: (s.rotation ?? 0) + Math.PI };
  }
  const n = nav.nodes.get(d.nodeId);
  if (!n) return undefined;
  return { type: 'goto', target: [n.position[0] + jitter * 0.5, n.position[1] - jitter * 0.4], nodeId: n.id };
}

export function reactionFor(outcome: TaskOutcomeKind): Reaction {
  return outcome === 'completed' ? 'celebrate' : outcome === 'failed' ? 'fail' : 'cancel';
}

/** Stable key so effects re-run only when the intent really changes. */
export function intentKey(agent: AgentState, task: Task | undefined): string {
  const d = agent.destination;
  const dest = d ? ('stationId' in d ? `s:${d.stationId}` : `n:${d.nodeId}`) : '';
  return [agent.status, agent.stationId, agent.slotIndex, agent.currentTaskId, task?.stalled ? 1 : 0, dest].join('|');
}
