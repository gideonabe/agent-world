import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '../context';
import { flat } from '../assets/shapes';

const BPM = 118;
const FLOOR_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#ff7b00'].map((c) => new THREE.Color(c));

/** Drives `ambience.beat` (0..1, peaks on every beat) for everything that pulses with the music. */
export function BeatDriver() {
  const { ambience } = useEngine();
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * BPM) / 60;
    ambience.beat = Math.pow(1 - (t % 1), 3);
  });
  return null;
}

/** A grid of light-up tiles that change colour on the beat. */
export function DanceFloor({ size = 5, tile = 1.0, center = [0, 0] as [number, number] }) {
  const { ambience } = useEngine();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = size * size;
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = (i % size) - (size - 1) / 2;
      const z = Math.floor(i / size) - (size - 1) / 2;
      o.position.set(center[0] + x * tile, 0.02, center[1] + z * tile);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, FLOOR_COLORS[i % FLOOR_COLORS.length]!);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count, size, tile, center]);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const beat = Math.floor((clock.elapsedTime * BPM) / 60);
    const pulse = 0.35 + ambience.beat * 0.65;
    for (let i = 0; i < count; i++) {
      const x = i % size;
      const z = Math.floor(i / size);
      const k = (x + z * 2 + beat * (beat % 4 < 2 ? 1 : 3)) % FLOOR_COLORS.length;
      const on = (x + z + beat) % 3 !== 0 ? 1 : 0.25;
      color.copy(FLOOR_COLORS[k]!).multiplyScalar(on * pulse);
      m.setColorAt(i, color);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} receiveShadow>
      <planeGeometry args={[tile * 0.94, tile * 0.94]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Coloured light beams sweeping the room from the corners. */
export function SpotBeams({ positions, height = 5.5 }: { positions: [number, number][]; height?: number }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const mats = useMemo(
    () =>
      positions.map(
        (_, i) =>
          new THREE.MeshBasicMaterial({
            color: FLOOR_COLORS[(i * 2) % FLOOR_COLORS.length]!,
            transparent: true,
            opacity: 0.11,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
      ),
    [positions],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const [x, z] = positions[i]!;
      // aim at the middle, wobbling around it
      const yaw = Math.atan2(-x, -z) + Math.sin(t * 0.7 + i * 1.7) * 0.5;
      g.rotation.set(0, yaw, 0);
      const tilt = g.children[0];
      if (tilt) tilt.rotation.x = 0.85 + Math.sin(t * 0.9 + i) * 0.2;
      mats[i]!.color.copy(FLOOR_COLORS[(Math.floor(t * 0.5) + i * 2) % FLOOR_COLORS.length]!);
    });
  });
  return (
    <group>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, height, z]} ref={(g) => void (refs.current[i] = g)}>
          <group>
            {/* beam: a long open cone hanging from the fixture, pointing along +z after the tilt */}
            <mesh position={[0, 0, 3.5]} rotation-x={-Math.PI / 2} material={mats[i]}>
              <coneGeometry args={[0.9, 7, 16, 1, true]} />
            </mesh>
          </group>
          <mesh material={flat('#2b2f3a')}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
