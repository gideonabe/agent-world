import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useEngine } from '../context';
import { mulberry32 } from '../math';

const DEFAULT_WIDTH = 1.05;

/**
 * Dirt paths generated from the navigation graph, so what agents walk on is
 * always what you see. Merged into a single draw call, plus instanced pebbles.
 */
export function Paths({ width: WIDTH = DEFAULT_WIDTH, pebbles: withPebbles = true, plaza = 2.5 }: { width?: number; pebbles?: boolean; plaza?: number } = {}) {
  const { nav, theme, world } = useEngine();
  const p = theme.palette;

  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const [a, b] of nav.edges) {
      const dx = b.position[0] - a.position[0];
      const dz = b.position[1] - a.position[1];
      const len = Math.hypot(dx, dz);
      const g = new THREE.PlaneGeometry(WIDTH, len);
      g.rotateX(-Math.PI / 2);
      g.rotateY(Math.atan2(dx, dz));
      g.translate((a.position[0] + b.position[0]) / 2, 0, (a.position[1] + b.position[1]) / 2);
      parts.push(g);
    }
    for (const n of nav.nodes.values()) {
      const g = new THREE.CircleGeometry(WIDTH * 0.62, 10);
      g.rotateX(-Math.PI / 2);
      g.translate(n.position[0], 0, n.position[1]);
      parts.push(g);
    }
    // plaza clearing
    const home = world.stations.find((s) => s.id === world.homeStationId);
    if (home && plaza > 0) {
      const g = new THREE.CircleGeometry(plaza, 14);
      g.rotateX(-Math.PI / 2);
      g.translate(home.position[0], 0, home.position[1]);
      parts.push(g);
    }
    const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    parts.forEach((g) => g.dispose());
    return merged;
  }, [nav, world, WIDTH, plaza]);

  const pebbles = useMemo(() => {
    if (!withPebbles) return [];
    const rnd = mulberry32(world.island.seed + 9);
    const list: { x: number; z: number; s: number; r: number }[] = [];
    for (const [a, b] of nav.edges) {
      const len = Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1]);
      const nx = -(b.position[1] - a.position[1]) / len;
      const nz = (b.position[0] - a.position[0]) / len;
      const count = Math.floor(len * 1.6);
      for (let i = 0; i < count; i++) {
        const t = rnd();
        const side = rnd() < 0.5 ? -1 : 1;
        const off = side * (WIDTH / 2 + 0.05 + rnd() * 0.12);
        list.push({
          x: a.position[0] + (b.position[0] - a.position[0]) * t + nx * off,
          z: a.position[1] + (b.position[1] - a.position[1]) * t + nz * off,
          s: 0.06 + rnd() * 0.08,
          r: rnd() * Math.PI,
        });
      }
    }
    return list;
  }, [nav, world.island.seed, withPebbles, WIDTH]);

  const inst = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = inst.current;
    if (!m) return;
    const o = new THREE.Object3D();
    pebbles.forEach((pb, i) => {
      o.position.set(pb.x, 0.02, pb.z);
      o.rotation.set(0, pb.r, 0);
      o.scale.set(pb.s * 1.4, pb.s * 0.6, pb.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [pebbles]);

  return (
    <group>
      <mesh geometry={geometry} position-y={0.015} receiveShadow>
        <meshStandardMaterial color={p.path} roughness={1} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {pebbles.length > 0 && <instancedMesh ref={inst} args={[undefined, undefined, pebbles.length]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={p.pathEdge} flatShading roughness={1} />
      </instancedMesh>}
    </group>
  );
}
