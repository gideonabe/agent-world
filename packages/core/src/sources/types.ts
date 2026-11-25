import type { AgentWorldEvent, EventEnvelope, WorldSnapshot } from '@agent-world/protocol';

/** Extra hooks a source may use besides emitting events. */
export interface SourceControls {
  /** Replace the store's state with an authoritative snapshot (e.g. on (re)connect). */
  hydrate(snapshot: WorldSnapshot): void;
}

/**
 * Anything that produces Agent World events: a mock simulator, a WebSocket
 * connection, a replay file, ... Swapping sources never touches the engine.
 */
export interface AgentEventSource {
  readonly name: string;
  start(emit: (env: EventEnvelope) => void, controls?: SourceControls): void;
  stop(): void;
}

/** A source that can also carry commands upstream (e.g. a socket to the server). */
export interface BidirectionalEventSource extends AgentEventSource {
  send(events: AgentWorldEvent[]): void;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
