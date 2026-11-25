import { useMemo } from 'react';
import * as THREE from 'three';
import { useEngine } from '../context';
import { shoreNoise } from '../math';

export const WATER_LEVEL = -0.5;

function shorelineShape(radius: number, seed: number, scale: number, segments = 56) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = radius * scale * shoreNoise(a, seed);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

/** Extruded slab whose top face sits at `top`. */
function slab(shape: THREE.Shape, depth: number, top: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - depth - bevel, 0);
  return g;
}

/** Layered "diorama cake" island: grass top, earthy cliffs, sandy beach. */
export function Island() {
  const { world, theme } = useEngine();
  const { radius, seed } = world.island;
  const p = theme.palette;

  const geos = useMemo(
    () => ({
      grass: slab(shorelineShape(radius, seed, 1), 0.3, 0, 0.14),
      cliff: slab(shorelineShape(radius, seed, 0.985, 40), 1.25, -0.3, 0.12),
      under: slab(shorelineShape(radius, seed + 1, 0.9, 28), 1.4, -1.6, 0.25),
      beach: slab(shorelineShape(radius, seed + 2, 1.075, 64), 0.25, WATER_LEVEL + 0.12, 0.2),
    }),
    [radius, seed],
  );

  return (
    <group>
      <mesh geometry={geos.grass} receiveShadow>
        <meshStandardMaterial color={p.grass} flatShading roughness={0.95} />
      </mesh>
      <mesh geometry={geos.cliff} receiveShadow castShadow>
        <meshStandardMaterial color={p.cliff} flatShading roughness={1} />
      </mesh>
      <mesh geometry={geos.under}>
        <meshStandardMaterial color={p.cliffDark} flatShading roughness={1} />
      </mesh>
      <mesh geometry={geos.beach} receiveShadow>
        <meshStandardMaterial color={p.sand} flatShading roughness={1} />
      </mesh>
    </group>
  );
}
