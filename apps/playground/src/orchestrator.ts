import { generateTaskId, type AgentWorldStore, type BidirectionalEventSource, type MockEventSource } from '@agent-world/core';
import type { AgentDestination } from '@agent-world/protocol';

/**
 * What the playground UI can ask agents to do. The UI doesn't care whether
 * agents are simulated locally or live behind a server.
 */
export interface Orchestrator {
  assign: (agentId: string, kind: string, title: string, priority?: number) => void;
  cancel: (taskId: string) => void;
  retry: (taskId: string) => void;
  moveAgent: (agentId: string, destination: AgentDestination | null) => void;
  remove: (agentId: string) => void;
}

const retryMeta = (meta: Record<string, unknown> | undefined, id: string) => ({
  retryOf: (meta?.retryOf as string | undefined) ?? id,
  attempt: ((meta?.attempt as number | undefined) ?? 1) + 1,
});

/** Local mode: simulated agents run in the mock; others get plain store commands. */
export function createOrchestrator(store: AgentWorldStore, mock: MockEventSource): Orchestrator {
  const st = () => store.getState();
  return {
    assign: (agentId, kind, title, priority = 0) => {
      if (mock.owns(agentId)) mock.assign(agentId, kind, title, { priority });
      else st().assignTask({ agentId, kind, title, ...(priority ? { priority } : {}) });
    },
    cancel: (taskId) => {
      if (!mock.cancel(taskId)) st().cancelTask(taskId, 'Cancelled by operator');
    },
    retry: (taskId) => {
      const t = st().tasks[taskId];
      if (!t) return;
      if (mock.owns(t.agentId)) mock.assign(t.agentId, t.kind, t.title, { priority: t.priority ?? 0, metadata: retryMeta(t.metadata, t.id) });
      else st().retryTask(taskId);
    },
    moveAgent: (agentId, destination) => st().moveAgent(agentId, destination),
    remove: (agentId) => {
      if (mock.owns(agentId)) mock.remove(agentId);
      else st().removeAgent(agentId);
    },
  };
}

/** Live mode: every command goes upstream; the server applies + broadcasts it back. */
export function createRemoteOrchestrator(store: AgentWorldStore, socket: BidirectionalEventSource): Orchestrator {
  return {
    assign: (agentId, kind, title, priority = 0) =>
      socket.send([{ type: 'task.assigned', task: { id: generateTaskId(), agentId, kind, title, ...(priority ? { priority } : {}) } }]),
    cancel: (taskId) => socket.send([{ type: 'task.cancelled', taskId, reason: 'Cancelled by operator' }]),
    retry: (taskId) => {
      const t = store.getState().tasks[taskId];
      if (!t) return;
      socket.send([
        {
          type: 'task.assigned',
          task: {
            id: generateTaskId(),
            agentId: t.agentId,
            kind: t.kind,
            title: t.title,
            ...(t.priority ? { priority: t.priority } : {}),
            metadata: { ...t.metadata, ...retryMeta(t.metadata, t.id) },
          },
        },
      ]);
    },
    moveAgent: (agentId, destination) => socket.send([{ type: 'agent.destination', agentId, destination }]),
    remove: (agentId) => socket.send([{ type: 'agent.removed', agentId }]),
  };
}
