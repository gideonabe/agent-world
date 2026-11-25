import { isTerminalStatus, type AgentStatus, type StationDef, type Task } from '@agent-world/protocol';
import type { AgentState, WorldState } from './types';
import type { AgentWorldStoreState } from './store';

/**
 * Pure, reusable queries over world state. Selectors that build new objects
 * must be wrapped with zustand's `useShallow` when used with `useStore`.
 */

export function selectAgentList(s: WorldState): AgentState[] {
  return Object.values(s.agents).sort((a, b) => a.registeredAt - b.registeredAt);
}

export function selectActiveTask(s: WorldState, agentId: string): Task | undefined {
  const id = s.agents[agentId]?.currentTaskId;
  return id ? s.tasks[id] : undefined;
}

export function selectQueue(s: WorldState, agentId: string): Task[] {
  return (s.agents[agentId]?.taskQueue ?? []).map((id) => s.tasks[id]).filter((t): t is Task => !!t);
}

/** Finished tasks, newest first. */
export function selectHistory(s: WorldState, agentId: string, limit = 10): Task[] {
  const h = s.agents[agentId]?.history ?? [];
  const out: Task[] = [];
  for (let i = h.length - 1; i >= 0 && out.length < limit; i--) {
    const t = s.tasks[h[i]!];
    if (t) out.push(t);
  }
  return out;
}

export function taskDurationMs(t: Task): number | undefined {
  const start = t.activatedAt ?? t.startedAt;
  return start !== undefined && t.endedAt !== undefined ? t.endedAt - start : undefined;
}

export interface AgentMetrics {
  completed: number;
  failed: number;
  cancelled: number;
  /** completed / (completed + failed); null before any result. */
  successRate: number | null;
  /** Average active time of finished tasks, ms. */
  avgTaskMs: number | null;
  queued: number;
}

export function selectAgentMetrics(s: WorldState, agentId: string): AgentMetrics | undefined {
  const a = s.agents[agentId];
  if (!a) return undefined;
  const { completed, failed, cancelled, busyMs } = a.stats;
  const finished = completed + failed + cancelled;
  return {
    completed,
    failed,
    cancelled,
    successRate: completed + failed ? completed / (completed + failed) : null,
    avgTaskMs: finished ? busyMs / finished : null,
    queued: a.taskQueue.length,
  };
}

export interface WorldMetrics {
  agents: number;
  byStatus: Record<AgentStatus, number>;
  activeTasks: number;
  queuedTasks: number;
  stalledTasks: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
}

export function selectWorldMetrics(s: WorldState): WorldMetrics {
  const byStatus: Record<AgentStatus, number> = { idle: 0, assigned: 0, working: 0, completed: 0, failed: 0, offline: 0 };
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let queuedTasks = 0;
  for (const a of Object.values(s.agents)) {
    byStatus[a.status]++;
    completed += a.stats.completed;
    failed += a.stats.failed;
    cancelled += a.stats.cancelled;
    queuedTasks += a.taskQueue.length;
  }
  let activeTasks = 0;
  let stalledTasks = 0;
  for (const t of Object.values(s.tasks)) {
    if (t.status === 'assigned' || t.status === 'in_progress') {
      activeTasks++;
      if (t.stalled) stalledTasks++;
    }
  }
  return {
    agents: Object.keys(s.agents).length,
    byStatus,
    activeTasks,
    queuedTasks,
    stalledTasks,
    completed,
    failed,
    cancelled,
    successRate: completed + failed ? completed / (completed + failed) : null,
  };
}

export interface StationLoad {
  station: StationDef;
  occupied: number;
  capacity: number;
  /** Agents waiting beyond capacity. */
  waiting: number;
}

export function selectStationLoad(s: AgentWorldStoreState): StationLoad[] {
  return s.world.stations.map((station) => {
    const occ = (s.occupancy[station.id] ?? []).filter((a) => a !== null).length;
    return {
      station,
      occupied: Math.min(occ, station.slots.length),
      capacity: station.slots.length,
      waiting: Math.max(0, occ - station.slots.length),
    };
  });
}

/** Task kinds the world can route to a dedicated station (excludes the wildcard). */
export function selectRoutableKinds(s: AgentWorldStoreState): string[] {
  const kinds = new Set<string>();
  for (const st of s.world.stations) for (const k of st.accepts) if (k !== '*') kinds.add(k);
  return [...kinds];
}

export function isTaskActive(t: Task) {
  return !isTerminalStatus(t.status) && t.status !== 'queued';
}
