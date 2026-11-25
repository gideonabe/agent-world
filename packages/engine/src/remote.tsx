import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAgentWorldStore, WebSocketEventSource, type AgentWorldStore, type ConnectionStatus } from '@agent-world/core';
import type { WorldConfig } from '@agent-world/protocol';
import { AgentWorld, type AgentWorldProps } from './AgentWorld';
import { meadowIsland } from './presets/meadowIsland';

export interface RemoteWorldOptions {
  /** Server base URL, e.g. http://127.0.0.1:8787 */
  server: string;
  /** Project id (default "default"). */
  project?: string;
  /** Read (or write) key, when the server runs with --auth. */
  token?: string;
  /** World layout; must match the project's world (default: Meadow Island). */
  world?: WorldConfig;
}

/** http(s)://host → ws(s)://host/v1/projects/<project>/ws */
export function remoteSocketUrl(server: string, project = 'default') {
  const u = new URL(server);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/v1/projects/${encodeURIComponent(project)}/ws`;
  return u.toString();
}

export interface RemoteWorld {
  store: AgentWorldStore;
  socket: WebSocketEventSource;
  status: ConnectionStatus;
  /** Last connection error (e.g. "Invalid or revoked API key"). */
  error: string | undefined;
}

/**
 * Connects a store to a server project. Use it when you want your own UI
 * around the world (lists, stats) on top of the same live state.
 */
export function useRemoteWorld({ server, project = 'default', token, world = meadowIsland }: RemoteWorldOptions): RemoteWorld {
  const { store, socket } = useMemo(
    () => ({
      // the server runs settle/stall timers; viewers just mirror its state
      store: createAgentWorldStore(world, { lifecycle: false }),
      socket: new WebSocketEventSource({ url: remoteSocketUrl(server, project), ...(token ? { token } : {}) }),
    }),
    [server, project, token, world],
  );
  useEffect(() => store.getState().connect(socket), [store, socket]);
  const status = useSyncExternalStore(
    (cb) => socket.onStatus(cb),
    () => socket.status,
  );
  return { store, socket, status, error: status === 'closed' ? socket.lastError : undefined };
}

export interface AgentWorldViewProps extends RemoteWorldOptions, Omit<AgentWorldProps, 'store'> {
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: ConnectionStatus, error?: string) => void;
}

/**
 * Drop-in live view of a project:
 *
 *   <AgentWorldView server="http://127.0.0.1:8787" project="my-app" token={READ_KEY} />
 */
export function AgentWorldView({ server, project, token, world, onStatusChange, ...rest }: AgentWorldViewProps) {
  const remote = useRemoteWorld({ server, ...(project ? { project } : {}), ...(token ? { token } : {}), ...(world ? { world } : {}) });
  useEffect(() => onStatusChange?.(remote.status, remote.error), [remote.status, remote.error, onStatusChange]);
  return <AgentWorld store={remote.store} {...rest} />;
}
