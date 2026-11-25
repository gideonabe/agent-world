import { z } from 'zod';
import { AgentDescriptorSchema, AgentStatusSchema } from './agent';
import { TaskInputSchema } from './task';

export const AgentDestinationSchema = z.union([
  z.object({ stationId: z.string().min(1) }),
  z.object({ nodeId: z.string().min(1) }),
]);
export type AgentDestination = z.infer<typeof AgentDestinationSchema>;

/**
 * The single, standardized event vocabulary. Every producer (mock source,
 * WebSocket server, SDK) emits these, and the core reducer is the only
 * place that turns them into state.
 */
export const AgentWorldEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent.registered'), agent: AgentDescriptorSchema }),
  z.object({ type: z.literal('agent.updated'), agent: AgentDescriptorSchema.partial().required({ id: true }) }),
  z.object({ type: z.literal('agent.removed'), agentId: z.string() }),
  z.object({
    type: z.literal('agent.status'),
    agentId: z.string(),
    status: AgentStatusSchema,
    message: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('agent.destination'),
    agentId: z.string(),
    /** Where the agent should rest while idle; null returns it to free roaming. */
    destination: AgentDestinationSchema.nullable(),
  }),
  z.object({ type: z.literal('task.assigned'), task: TaskInputSchema }),
  z.object({ type: z.literal('task.started'), taskId: z.string() }),
  z.object({
    type: z.literal('task.progress'),
    taskId: z.string(),
    progress: z.number().min(0).max(1),
    message: z.string().max(500).optional(),
    /** Multi-step tasks: a task kind for the current step. A new phase re-routes the
     *  agent to a matching station (e.g. research → coding → automation). */
    phase: z.string().min(1).max(64).optional(),
  }),
  z.object({ type: z.literal('task.completed'), taskId: z.string(), result: z.unknown().optional() }),
  z.object({ type: z.literal('task.failed'), taskId: z.string(), error: z.string().max(1000) }),
  z.object({ type: z.literal('task.cancelled'), taskId: z.string(), reason: z.string().max(500).optional() }),
  /** Usually emitted by the store's lifecycle monitor when a task stops reporting. */
  z.object({ type: z.literal('task.stalled'), taskId: z.string() }),
]);
export type AgentWorldEvent = z.infer<typeof AgentWorldEventSchema>;
export type AgentWorldEventType = AgentWorldEvent['type'];

/** Transport envelope: adds identity + ordering metadata to an event. */
export const EventEnvelopeSchema = z.object({
  id: z.string(),
  /** Epoch milliseconds when the event was produced. */
  ts: z.number(),
  projectId: z.string().optional(),
  /** Producer label, e.g. "mock", "sdk", "system" (store-generated). */
  source: z.string().max(64).optional(),
  event: AgentWorldEventSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

let counter = 0;
export function createEnvelope(event: AgentWorldEvent, projectId?: string, ts = Date.now(), source?: string): EventEnvelope {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const env: EventEnvelope = { id: `${ts.toString(36)}-${counter.toString(36)}`, ts, event };
  if (projectId) env.projectId = projectId;
  if (source) env.source = source;
  return env;
}

/** Validates untrusted input (e.g. from a socket). Returns null when invalid. */
export function parseEnvelope(input: unknown): EventEnvelope | null {
  const r = EventEnvelopeSchema.safeParse(input);
  return r.success ? r.data : null;
}
