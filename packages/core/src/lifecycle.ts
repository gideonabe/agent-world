import type { AgentWorldEvent } from '@agent-world/protocol';
import type { WorldState } from './types';

export interface LifecycleOptions {
  /** completed/failed agents return to idle after this long (ms). 0 disables. */
  settleMs?: number;
  /** Active tasks with no updates for this long are flagged stalled (ms). 0 disables. */
  staleMs?: number;
  /** How often the monitor checks (ms). */
  intervalMs?: number;
}

export const DEFAULT_LIFECYCLE: Required<LifecycleOptions> = {
  settleMs: 4000,
  staleMs: 30000,
  intervalMs: 1000,
};

/**
 * Pure check: which system events are due at time `now`?
 * Kept separate from timers so it is trivially testable.
 */
export function dueLifecycleEvents(s: WorldState, now: number, opts: Required<LifecycleOptions>): AgentWorldEvent[] {
  const out: AgentWorldEvent[] = [];
  if (opts.settleMs > 0) {
    for (const a of Object.values(s.agents)) {
      if ((a.status === 'completed' || a.status === 'failed') && now - a.statusSince >= opts.settleMs) {
        out.push({ type: 'agent.status', agentId: a.descriptor.id, status: 'idle' });
      }
    }
  }
  if (opts.staleMs > 0) {
    for (const t of Object.values(s.tasks)) {
      if ((t.status === 'assigned' || t.status === 'in_progress') && !t.stalled && now - t.lastUpdateAt >= opts.staleMs) {
        out.push({ type: 'task.stalled', taskId: t.id });
      }
    }
  }
  return out;
}
