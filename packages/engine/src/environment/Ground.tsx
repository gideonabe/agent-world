import { useMemo } from 'react';
import * as THREE from 'three';
import { useEngine } from '../context';

/**
 * Square diorama block for indoor and town worlds: a floor top (palette.grass), a trim band (palette.sand),
 * thick sides (palette.cliff) and a darker plinth (palette.cliffDark). The top surface sits at y = 0, like the island.
 */
export function Ground({ tiles = true }: { tiles?: boolean }) {
  const { world, theme } = useEngine();
  const R = world.island.radius;
  const p = theme.palette;

  // a subtle checker of floor tiles, merged into one mesh
  const tileGeo = useMemo(() => {
    if (!tiles) return null;
    const size = 2;
    const n = Math.floor((R * 2) / size);
    const start = -n * size * 0.5;
    const parts: number[] = [];
    const quad = (x: number, z: number, s: number) => {
      const y = 0.003;
      parts.push(x, y, z, x, y, z + s, x + s, y, z, x + s, y, z, x, y, z + s, x + s, y, z + s);
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2 === 0) quad(start + i * size, start + j * size, size);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
    g.computeVertexNormals();
    return g;
  }, [R, tiles]);

  return (
    <group>
      <mesh position-y={-0.15} receiveShadow>
        <boxGeometry args={[R * 2, 0.3, R * 2]} />
        <meshStandardMaterial color={p.grass} flatShading roughness={0.95} />
      </mesh>
      {tileGeo && (
        <mesh geometry={tileGeo} receiveShadow>
          <meshStandardMaterial color={p.grassDark} roughness={0.95} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      <mesh position-y={-0.32} receiveShadow>
        <boxGeometry args={[R * 2 + 0.5, 0.16, R * 2 + 0.5]} />
        <meshStandardMaterial color={p.sand} flatShading roughness={1} />
      </mesh>
      <mesh position-y={-1.1} castShadow receiveShadow>
        <boxGeometry args={[R * 2 + 0.3, 1.45, R * 2 + 0.3]} />
        <meshStandardMaterial color={p.cliff} flatShading roughness={1} />
      </mesh>
      <mesh position-y={-2.1}>
        <boxGeometry args={[R * 2 - 0.6, 0.6, R * 2 - 0.6]} />
        <meshStandardMaterial color={p.cliffDark} flatShading roughness={1} />
      </mesh>
    </group>
  );
}

/** Soft ground below the floating block, so it doesn't hang in empty space (indoor worlds have no water). */
export function Backdrop() {
  const { world, theme } = useEngine();
  const R = world.island.radius;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-3} receiveShadow>
      <circleGeometry args={[R * 6, 48]} />
      <meshStandardMaterial color={theme.palette.water} roughness={1} />
    </mesh>
  );
}
