import type { AgentWorldStoreState } from '@agent-world/core';
import type { EventEnvelope } from '@agent-world/protocol';

export const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  assigned: 'On the way',
  working: 'Working',
  completed: 'Done',
  failed: 'Failed',
  offline: 'Offline',
};

export function agentName(s: AgentWorldStoreState, id: string) {
  return s.agents[id]?.descriptor.name ?? id;
}

/** One-line human description of an event. */
export function describe(env: EventEnvelope, s: AgentWorldStoreState): { icon: string; text: string; tone: string } | null {
  const e = env.event;
  const taskAgent = (taskId: string) => {
    const t = s.tasks[taskId];
    return t ? agentName(s, t.agentId) : 'An agent';
  };
  switch (e.type) {
    case 'agent.registered':
      return { icon: '✦', text: `${e.agent.name} joined the island`, tone: 'info' };
    case 'agent.removed':
      return { icon: '←', text: `${agentName(s, e.agentId)} left`, tone: 'muted' };
    case 'task.assigned':
      return { icon: "→", text: `${agentName(s, e.task.agentId)} ${s.tasks[e.task.id]?.status === "queued" ? "queued" : "picked up"} “${e.task.title}”`, tone: "info" };
    case 'task.completed':
      return { icon: '✓', text: `${taskAgent(e.taskId)} finished “${s.tasks[e.taskId]?.title ?? ''}”`, tone: 'ok' };
    case 'task.failed':
      return { icon: '!', text: `${taskAgent(e.taskId)} failed: ${e.error}`, tone: 'bad' };
    case 'task.cancelled':
      return { icon: '–', text: `${taskAgent(e.taskId)} dropped “${s.tasks[e.taskId]?.title ?? ''}”`, tone: 'muted' };
    case 'task.stalled':
      return { icon: '?', text: `${taskAgent(e.taskId)} stopped reporting progress`, tone: 'warn' };
    case 'agent.destination': {
      const d = e.destination;
      const where = !d ? 'free roam' : 'stationId' in d ? (s.world.stations.find((st) => st.id === d.stationId)?.name ?? d.stationId) : d.nodeId;
      return { icon: '⌖', text: `${agentName(s, e.agentId)} now rests at ${where}`, tone: 'info' };
    }
    default:
      return null;
  }
}

export function formatDuration(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms)) return '–';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}
