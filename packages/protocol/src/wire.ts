import { z } from 'zod';
import { EventEnvelopeSchema, AgentWorldEventSchema } from './events';

/**
 * WebSocket wire format. Every frame is one JSON object with a `kind`.
 *
 * server → client
 *   hello     first frame after connecting
 *   snapshot  full current state (sent on connect so late joiners catch up)
 *   events    batch of envelopes, in order
 *   error     something the client sent was rejected
 *   pong      reply to ping
 *
 * client → server
 *   events    bare events or full envelopes to apply (server validates + stamps)
 *   ping      keep-alive
 */
export const WIRE_VERSION = 1;

/** Serializable world state (the parts that matter for rendering). */
export const WorldSnapshotSchema = z.object({
  agents: z.record(z.string(), z.any()),
  tasks: z.record(z.string(), z.any()),
  occupancy: z.record(z.string(), z.array(z.string().nullable())),
});
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;

export const ServerMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello'), version: z.number(), serverTime: z.number(), projectId: z.string().optional(), worldId: z.string().optional() }),
  z.object({ kind: z.literal('snapshot'), serverTime: z.number(), worldId: z.string().optional(), state: WorldSnapshotSchema }),
  z.object({ kind: z.literal('events'), envelopes: z.array(EventEnvelopeSchema) }),
  z.object({ kind: z.literal('error'), message: z.string(), code: z.string().optional() }),
  z.object({ kind: z.literal('pong'), serverTime: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const ClientMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('events'),
    events: z.array(z.union([EventEnvelopeSchema, AgentWorldEventSchema])).max(500),
  }),
  z.object({ kind: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  const r = ServerMessageSchema.safeParse(parseJson(raw));
  return r.success ? r.data : null;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const r = ClientMessageSchema.safeParse(parseJson(raw));
  return r.success ? r.data : null;
}
