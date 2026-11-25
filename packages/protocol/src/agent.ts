import { z } from 'zod';

/**
 * Agent kinds are open strings so integrators can define their own.
 * These are the built-in kinds that the default world knows how to place.
 */
export const BUILTIN_AGENT_KINDS = ['research', 'coding', 'writing', 'automation', 'general'] as const;
export type BuiltinAgentKind = (typeof BUILTIN_AGENT_KINDS)[number];

export const AgentStatusSchema = z.enum([
  'idle', // registered, no task
  'assigned', // task received, heading to station
  'working', // actively executing a task
  'completed', // just finished a task successfully
  'failed', // just failed a task
  'offline', // disconnected / paused
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentAppearanceSchema = z.object({
  /** Primary body color (any CSS color). */
  color: z.string().optional(),
  /** Accent color used for visor / UI chips. */
  accent: z.string().optional(),
  /** Theme model key or absolute URL to a GLB. */
  model: z.string().optional(),
  /** Uniform scale multiplier. */
  scale: z.number().positive().max(5).optional(),
});
export type AgentAppearance = z.infer<typeof AgentAppearanceSchema>;

export const AgentDescriptorSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  kind: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  appearance: AgentAppearanceSchema.optional(),
  /** Free-form integrator data; never interpreted by the engine. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;
