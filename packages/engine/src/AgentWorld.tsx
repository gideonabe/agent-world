import { Suspense, useMemo, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Stats } from '@react-three/drei';
import type { AgentWorldStore } from '@agent-world/core';
import { EngineProvider } from './context';
import { SelectionContext } from './selection';
import { meadowTheme } from './themes/meadow';
import type { Theme } from './themes/theme';
import { Island } from './environment/Island';
import { Water } from './environment/Water';
import { Paths } from './environment/Paths';
import { Decor } from './environment/Decor';
import { Clouds, Lighting } from './environment/Sky';
import { Stations } from './stations/Station';
import { Agents } from './characters/Agents';
import { CameraRig } from './camera/CameraRig';
import { preloadWorldAssets } from './assets/preload';
import { Effects } from './effects/Effects';

export interface AgentWorldProps {
  /** Store created with `createAgentWorldStore(world)`. */
  store: AgentWorldStore;
  theme?: Theme;
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string | null) => void;
  /** Event-driven particles and popups (confetti, sparks, ...). Default true. */
  effects?: boolean;
  /** Show an FPS meter (dev). */
  stats?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The embeddable 3D world. Everything it shows comes from the store
 * (agents/tasks) and the world config (layout) — nothing is hardcoded.
 */
export function AgentWorld({ store, theme = meadowTheme, selectedAgentId = null, onSelectAgent, effects = true, stats, className, style }: AgentWorldProps) {
  useMemo(() => preloadWorldAssets(store.getState().world, theme), [store, theme]);
  const selection = useMemo(
    () => ({ selectedId: selectedAgentId, select: (id: string | null) => onSelectAgent?.(id) }),
    [selectedAgentId, onSelectAgent],
  );
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 32, near: 0.5, far: 400, position: [30, 28, 34] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => onSelectAgent?.(null)}
      >
        <EngineProvider store={store} theme={theme}>
          <SelectionContext.Provider value={selection}>
            <Lighting />
            <Island />
            <Water />
            <Paths />
            <Clouds />
            {/* separate boundaries: each part appears as soon as its models are ready */}
            <Suspense fallback={null}>
              <Decor />
            </Suspense>
            <Suspense fallback={null}>
              <Stations />
            </Suspense>
            <Suspense fallback={null}>
              <Agents />
            </Suspense>
            {effects && <Effects />}
            <CameraRig />
          </SelectionContext.Provider>
        </EngineProvider>
        <AdaptiveDpr pixelated={false} />
        {stats && <Stats />}
      </Canvas>
    </div>
  );
}
