import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { useEngine } from '../context';
import { Model, Prop } from '../assets/Model';
import { scatterDecor, type DecorItem } from './scatter';

/** Scattered trees/rocks/plants plus the world's hand-placed props. */
export function Decor() {
  const { world, theme } = useEngine();
  const items = useMemo(() => scatterDecor(world, theme.decor, theme.propScale, theme.decorCounts), [world, theme]);
  return (
    <group>
      {items.map((it, i) =>
        it.category === 'tree' || it.category === 'shore' ? (
          <SwayingTree key={i} item={it} phase={i * 1.7} />
        ) : (
          <Model
            key={i}
            model={it.model}
            position={[it.position[0], 0, it.position[1]]}
            rotation={it.rotation}
            scale={it.scale}
            castShadow={it.category === 'rock'}
          />
        ),
      )}
      {(world.props ?? []).map((p, i) => (
        <Prop key={`p${i}`} prop={p} baseScale={theme.propScale} />
      ))}
    </group>
  );
}

/** Trees sway gently in the wind (one cheap rotation per tree). */
function SwayingTree({ item, phase }: { item: DecorItem; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.9 + phase;
    g.rotation.x = Math.sin(t) * 0.018;
    g.rotation.z = Math.cos(t * 0.8) * 0.018;
  });
  return (
    <group ref={ref} position={[item.position[0], 0, item.position[1]]}>
      <Model model={item.model} rotation={item.rotation} scale={item.scale} />
    </group>
  );
}
