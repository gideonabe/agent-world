import { z } from 'zod';

/**
 * Task lifecycle:
 *   queued ──► assigned ──► in_progress ──► completed | failed
 *      └──────────┴──────────────┴────────► cancelled
 * "queued"   = waiting in the agent's backlog (agent is busy with another task)
 * "assigned" = the agent's active task; it is heading to the station
 */
export const TaskStatusSchema = z.enum(['queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export function isTerminalStatus(s: TaskStatus) {
  return s === 'completed' || s === 'failed' || s === 'cancelled';
}

/** What an integrator sends when handing a task to an agent. */
export const TaskInputSchema = z.object({
  id: z.string().min(1).max(128),
  agentId: z.string().min(1).max(128),
  /** Task kind decides which station the agent walks to (e.g. "research"). */
  kind: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  /** Optional explicit station override. */
  stationId: z.string().max(128).optional(),
  /** Higher runs first when the agent has a backlog. Default 0. */
  priority: z.number().int().min(-100).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TaskInput = z.infer<typeof TaskInputSchema>;

/** Task as tracked by the core store. */
export interface Task extends TaskInput {
  status: TaskStatus;
  /** 0..1 */
  progress: number;
  message?: string;
  error?: string;
  result?: unknown;
  /** Current step kind for multi-step tasks (see task.progress.phase). */
  phase?: string;
  /** No progress reported for longer than the stale threshold. */
  stalled?: boolean;
  createdAt: number;
  /** When it became the agent's active task. */
  activatedAt?: number;
  startedAt?: number;
  endedAt?: number;
  /** Last time any event touched this task. */
  lastUpdateAt: number;
}
