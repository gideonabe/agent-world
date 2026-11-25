import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useStore } from 'zustand';
import * as THREE from 'three';
import type { StationDef } from '@agent-viz/protocol';
import { useEngine } from '../context';
import { Prop } from '../assets/Model';
import { labelStyles } from '../ui/styles';

export function Stations() {
  const { world } = useEngine();
  return (
    <group>
      {world.stations.map((s) => (
        <Station key={s.id} station={s} />
      ))}
    </group>
  );
}

/** A workstation: deck, props from config, beacon that glows when busy, floating label. */
export function Station({ station }: { station: StationDef }) {
  const { store, theme, world } = useEngine();
  const busy = useStore(store, (s) => (s.occupancy[station.id] ?? []).filter(Boolean).length);
  const isHome = station.id === world.homeStationId;
  const color = station.color ?? '#ffffff';
  const radius = station.radius ?? 2.5;

  return (
    <group position={[station.position[0], 0, station.position[1]]} rotation-y={station.rotation ?? 0}>
      {!isHome && (
        <>
          <mesh position-y={0.012} receiveShadow>
            <cylinderGeometry args={[radius, radius, 0.06, 6]} />
            <meshStandardMaterial color={theme.palette.deck} flatShading roughness={0.9} />
          </mesh>
          <mesh position-y={-0.005}>
            <cylinderGeometry args={[radius + 0.14, radius + 0.14, 0.05, 6]} />
            <meshStandardMaterial color={color} flatShading roughness={0.7} />
          </mesh>
          <Beacon color={color} busy={busy} capacity={station.slots.length} position={[0, 0, -radius + 0.35]} />
        </>
      )}
      <group position-y={isHome ? 0 : 0.04}>
        {(station.props ?? []).map((p, i) => (
          <Prop key={i} prop={p} baseScale={theme.propScale} />
        ))}
      </group>
      <Html position={[0, isHome ? 2.2 : 3.0, isHome ? 0 : -radius + 0.35]} center zIndexRange={[20, 0]} pointerEvents="none">
        <div style={labelStyles.station(color, busy > 0)}>
          <span style={labelStyles.dot(color)} />
          {station.name}
          {busy > 0 && <span style={labelStyles.count}>{busy}</span>}
        </div>
      </Html>
    </group>
  );
}

function Beacon({ color, busy, capacity, position }: { color: string; busy: number; capacity: number; position: [number, number, number] }) {
  const orb = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const c = useMemo(() => new THREE.Color(color), [color]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (orb.current) {
      orb.current.position.y = 2.15 + Math.sin(t * 2) * 0.06;
      orb.current.rotation.y = t * (busy ? 1.6 : 0.4);
    }
    if (mat.current) {
      const target = busy ? 1.2 + 0.6 * (busy / Math.max(1, capacity)) + Math.sin(t * 5) * 0.25 : 0.25;
      mat.current.emissiveIntensity += (target - mat.current.emissiveIntensity) * 0.1;
    }
  });
  return (
    <group position={position}>
      <mesh position-y={0.95} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.9, 6]} />
        <meshStandardMaterial color="#5b4636" flatShading />
      </mesh>
      <mesh position-y={0.06} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.12, 6]} />
        <meshStandardMaterial color="#6d7a86" flatShading />
      </mesh>
      <mesh ref={orb} position-y={2.15} castShadow>
        <octahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial ref={mat} color={c} emissive={c} emissiveIntensity={0.3} flatShading />
      </mesh>
    </group>
  );
}
