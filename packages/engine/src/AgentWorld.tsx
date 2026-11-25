import { Suspense, useMemo, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from 'zustand';
import { AdaptiveDpr, Stats } from '@react-three/drei';
import type { AgentWorldStore } from '@agent-viz/core';
import { EngineProvider } from './context';
import { SelectionContext } from './selection';
import type { Theme } from './themes/theme';
import { Decor } from './environment/Decor';
import { Lighting } from './environment/Sky';
import { getWorldStyle } from './worlds';
import { useAmbientSound } from './sound';
import { Stations } from './stations/Station';
import { Agents } from './characters/Agents';
import { CameraRig } from './camera/CameraRig';
import { preloadWorldAssets } from './assets/preload';
import { Effects } from './effects/Effects';

export interface AgentWorldProps {
  /** Store created with `createAgentWorldStore(world)`. */
  store: AgentWorldStore;
  /** Overrides the look. By default each built-in world uses its own theme (see `getWorldStyle`). */
  theme?: Theme;
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string | null) => void;
  /** Event-driven particles and popups (confetti, sparks, ...). Default true. */
  effects?: boolean;
  /** Show an FPS meter (dev). */
  stats?: boolean;
  /**
   * Play the world's ambient sound (traffic, market chatter, party music, ...). Off by default; browsers only
   * allow it after the viewer interacts with the page, so turn it on from a button click.
   */
  sound?: boolean;
  /** Sound volume, 0..1 (default 0.35). */
  volume?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The embeddable 3D world. Everything it shows comes from the store
 * (agents/tasks) and the world config (layout) — nothing is hardcoded.
 */
export function AgentWorld({ store, theme: themeProp, selectedAgentId = null, onSelectAgent, effects = true, stats, sound = false, volume, className, style }: AgentWorldProps) {
  const world = useStore(store, (s) => s.world);
  useAmbientSound(world.id, sound, volume);
  const worldStyle = getWorldStyle(world.id);
  const theme = themeProp ?? worldStyle.theme;
  const { Scene } = worldStyle;
  useMemo(() => preloadWorldAssets(world, theme), [world, theme]);
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
            {/* background and fog attach to the scene, so lighting stays outside the keyed group */}
            <Lighting />
            {/* keyed by world: switching worlds rebuilds the scene and robots pop in at their new stations */}
            <group key={world.id}>
            <Scene />
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
            </group>
            <CameraRig />
          </SelectionContext.Provider>
        </EngineProvider>
        <AdaptiveDpr pixelated={false} />
        {stats && <Stats />}
      </Canvas>
    </div>
  );
}
