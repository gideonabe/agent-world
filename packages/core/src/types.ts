import type { AgentDescriptor, AgentDestination, AgentStatus, EventEnvelope, Task } from '@agent-world/protocol';

export type TaskOutcomeKind = 'completed' | 'failed' | 'cancelled';

export interface TaskOutcome {
  taskId: string;
  result: TaskOutcomeKind;
  at: number;
}

export interface AgentStats {
  completed: number;
  failed: number;
  cancelled: number;
  /** Total time spent on finished active tasks (ms). */
  busyMs: number;
}

export interface AgentState {
  descriptor: AgentDescriptor;
  status: AgentStatus;
  /** When `status` last changed (store clock). */
  statusSince: number;
  /** The task the agent is executing (or walking to). */
  currentTaskId?: string;
  /** Backlog of task ids, highest priority first. */
  taskQueue: string[];
  /** Finished task ids, newest last (capped). */
  history: string[];
  /** Station the agent is heading to / working at. */
  stationId?: string;
  /** Slot index within the station (may exceed slot count = queued). */
  slotIndex?: number;
  /** Where the agent rests while idle (set via `agent.destination`). */
  destination?: AgentDestination;
  /** Most recent finished active task — drives celebrate/fail reactions. */
  lastOutcome?: TaskOutcome;
  /** Latest human-readable status message. */
  message?: string;
  registeredAt: number;
  updatedAt: number;
  stats: AgentStats;
}

export interface WorldState {
  agents: Record<string, AgentState>;
  tasks: Record<string, Task>;
  /** stationId -> slot array of agentIds (null = free). */
  occupancy: Record<string, (string | null)[]>;
  /** Most recent events, newest last. */
  log: EventEnvelope[];
}

export const MAX_LOG = 150;
export const MAX_HISTORY = 25;
export const MAX_TASKS = 500;

export function emptyState(): WorldState {
  return { agents: {}, tasks: {}, occupancy: {}, log: [] };
}

export function emptyStats(): AgentStats {
  return { completed: 0, failed: 0, cancelled: 0, busyMs: 0 };
}
