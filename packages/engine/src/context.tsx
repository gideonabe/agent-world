import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AgentWorldStore } from '@agent-world/core';
import type { WorldConfig } from '@agent-world/protocol';
import { NavGraph } from './navigation/navGraph';
import type { Theme } from './themes/theme';
import type { AgentMotion } from './characters/agentMotion';

export interface EngineRuntime {
  store: AgentWorldStore;
  world: WorldConfig;
  theme: Theme;
  nav: NavGraph;
  /** Live motion state per agent, shared for camera follow + crowd separation. */
  motions: Map<string, AgentMotion>;
}

const EngineContext = createContext<EngineRuntime | null>(null);

export function EngineProvider({
  store,
  theme,
  children,
}: {
  store: AgentWorldStore;
  theme: Theme;
  children: ReactNode;
}) {
  const world = store.getState().world;
  const value = useMemo<EngineRuntime>(
    () => ({ store, world, theme, nav: new NavGraph(world.navigation), motions: new Map() }),
    [store, world, theme],
  );
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineRuntime {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside <AgentWorld>');
  return ctx;
}
