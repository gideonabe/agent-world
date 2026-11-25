import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '../context';
import { mulberry32 } from '../math';

/** Sun, sky fill and fog tuned for a soft miniature look. */
export function Lighting() {
  const { theme, world } = useEngine();
  const p = theme.palette;
  const R = world.island.radius;
  const sun = useRef<THREE.DirectionalLight>(null);
  return (
    <>
      <color attach="background" args={[p.background]} />
      <fog attach="fog" args={[p.fog, R * 3.2, R * 6.5]} />
      <hemisphereLight args={[p.hemiSky, p.hemiGround, 1.25]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={sun}
        color={p.sun}
        position={[R * 1.5, R * 2.6, R * 1.0]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-R * 1.3}
        shadow-camera-right={R * 1.3}
        shadow-camera-top={R * 1.3}
        shadow-camera-bottom={-R * 1.3}
        shadow-camera-near={1}
        shadow-camera-far={R * 7}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/** Puffy low-poly clouds drifting around the island, casting soft moving shadows. */
export function Clouds({ count = 8 }: { count?: number }) {
  const { world } = useEngine();
  const R = world.island.radius;
  const clouds = useMemo(() => {
    const rnd = mulberry32(world.island.seed + 3);
    return Array.from({ length: count }, () => ({
      radius: R * (0.2 + rnd() * 1.4),
      angle: rnd() * Math.PI * 2,
      height: 19 + rnd() * 3,
      speed: 0.015 + rnd() * 0.02,
      puffs: Array.from({ length: 3 + Math.floor(rnd() * 3) }, (_, i) => ({
        x: (i - 1.5) * 0.9 + rnd() * 0.3,
        y: rnd() * 0.35,
        z: (rnd() - 0.5) * 0.8,
        s: 0.9 + rnd() * 0.6,
      })),
    }));
  }, [count, R, world.island.seed]);

  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    clouds.forEach((c, i) => {
      c.angle += c.speed * dt;
      const g = refs.current[i];
      if (g) {
        g.position.set(Math.cos(c.angle) * c.radius, c.height, Math.sin(c.angle) * c.radius);
        g.rotation.y = -c.angle;
      }
    });
  });

  return (
    <group>
      {clouds.map((c, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={[p.x, p.y, p.z]} scale={p.s} castShadow>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#ffffff" flatShading roughness={1} transparent opacity={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
