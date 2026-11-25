import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '../context';
import { WATER_LEVEL } from './Island';

/**
 * Faceted low-poly ocean. Waves are displaced on the GPU (onBeforeCompile),
 * and flatShading derives facet normals in the fragment shader — no CPU work.
 */
export function Water() {
  const { theme, world } = useEngine();
  const p = theme.palette;
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: p.water,
      flatShading: true,
      roughness: 0.35,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float w = sin(position.x * 0.55 + uTime * 0.9) * 0.09
                   + cos(position.y * 0.45 + uTime * 0.7) * 0.08
                   + sin((position.x + position.y) * 0.9 + uTime * 1.6) * 0.035;
           transformed.z += w;`,
        );
    };
    return m;
  }, [p.water, uniforms]);

  const geometry = useMemo(() => new THREE.CircleGeometry(world.island.radius * 5, 96, 0, Math.PI * 2), [world.island.radius]);
  // CircleGeometry has no interior vertices; use a dense plane clipped by fog instead.
  const plane = useMemo(() => new THREE.PlaneGeometry(world.island.radius * 9, world.island.radius * 9, 110, 110), [world.island.radius]);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
  });

  return (
    <group position={[0, WATER_LEVEL, 0]}>
      <mesh geometry={plane} material={material} rotation-x={-Math.PI / 2} receiveShadow />
      {/* deep tint below the surface for depth */}
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={-1.2}>
        <meshBasicMaterial color={p.waterDeep} />
      </mesh>
      <Foam />
    </group>
  );
}

/** Soft pulsing foam ring around the beach. */
function Foam() {
  const { theme, world } = useEngine();
  const r = world.island.radius;
  const ref = useMemo(() => ({ mat: null as THREE.MeshBasicMaterial | null, mesh: null as THREE.Mesh | null }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ref.mat) ref.mat.opacity = 0.35 + Math.sin(t * 1.3) * 0.15;
    if (ref.mesh) ref.mesh.scale.setScalar(1 + Math.sin(t * 1.3) * 0.012);
  });
  return (
    <mesh ref={(m) => void (ref.mesh = m)} rotation-x={-Math.PI / 2} position-y={0.1}>
      <ringGeometry args={[r * 1.06, r * 1.17, 72, 1]} />
      <meshBasicMaterial ref={(m) => void (ref.mat = m)} color={theme.palette.foam} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}
