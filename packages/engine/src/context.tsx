import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AgentWorldStore } from '@agent-viz/core';
import type { WorldConfig } from '@agent-viz/protocol';
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
  /**
   * Shared, per-frame ambience values (mutated in place, read inside useFrame):
   * `night` goes from 0 (day) to 1 (night) for worlds with a day/night cycle, and `beat` pulses 0..1 to the party music.
   */
  ambience: { night: number; beat: number };
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
  // follow live world switches (e.g. a project moved from Meadow Island to the Office)
  const world = useStore(store, (s) => s.world);
  const value = useMemo<EngineRuntime>(
    () => ({ store, world, theme, nav: new NavGraph(world.navigation), motions: new Map(), ambience: { night: 0, beat: 0 } }),
    [store, world, theme],
  );
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineRuntime {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside <AgentWorld>');
  return ctx;
}
