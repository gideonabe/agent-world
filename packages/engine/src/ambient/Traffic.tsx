import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Car, flat } from '../assets/shapes';

/**
 * A closed loop road (a rounded square of half-size `half`) with cars driving round it in two lanes,
 * one each way. Cars in a lane share a speed, so they never bump into each other.
 */
export function RingRoad({ half, width = 2.8 }: { half: number; width?: number }) {
  const { asphalt, dashes, walks } = useMemo(() => {
    const outer = half + width / 2;
    const inner = half - width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-outer, -outer).lineTo(outer, -outer).lineTo(outer, outer).lineTo(-outer, outer).lineTo(-outer, -outer);
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner).lineTo(-inner, inner).lineTo(inner, inner).lineTo(inner, -inner).lineTo(-inner, -inner);
    shape.holes.push(hole);
    const asphalt = new THREE.ShapeGeometry(shape);
    asphalt.rotateX(-Math.PI / 2);

    // dashed centre line + zebra crossings in the middle of each side
    const dashes: { pos: [number, number, number]; rot: number; size: [number, number] }[] = [];
    const walks: { pos: [number, number, number]; rot: number }[] = [];
    for (let side = 0; side < 4; side++) {
      const rot = (side * Math.PI) / 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (let t = -half + 1; t <= half - 1; t += 1.4) {
        if (Math.abs(t) < 1.6) continue;
        const x = t * cos - -half * sin;
        const z = t * sin + -half * cos;
        dashes.push({ pos: [x, 0.012, z], rot: -rot, size: [0.7, 0.12] });
      }
      for (let k = -2; k <= 2; k++) {
        const t = k * 0.5;
        const x = t * cos - -half * sin;
        const z = t * sin + -half * cos;
        walks.push({ pos: [x, 0.013, z], rot: -rot });
      }
    }
    return { asphalt, dashes, walks };
  }, [half, width]);

  return (
    <group position-y={0.006}>
      <mesh geometry={asphalt} receiveShadow material={flat('#4b5260', 0.95)} />
      {dashes.map((d, i) => (
        <mesh key={i} position={d.pos} rotation={[-Math.PI / 2, 0, d.rot]} material={flat('#f5e6a8')}>
          <planeGeometry args={d.size} />
        </mesh>
      ))}
      {walks.map((w, i) => (
        <mesh key={`w${i}`} position={w.pos} rotation={[-Math.PI / 2, 0, w.rot + Math.PI / 2]} material={flat('#f4f4f4')}>
          <planeGeometry args={[width * 0.9, 0.26]} />
        </mesh>
      ))}
    </group>
  );
}

const CAR_COLORS = ['#e4572e', '#2e86ab', '#f2c14e', '#4caf50', '#f5f5f5', '#9c27b0', '#26323d', '#ff8c42'];

/** Position and heading at distance `d` along a square loop of half-size `h` (clockwise when dir = 1). */
function onLoop(d: number, h: number, dir: 1 | -1): { x: number; z: number; yaw: number } {
  const side = h * 2;
  const total = side * 4;
  let s = ((d % total) + total) % total;
  if (dir === -1) s = total - s;
  const seg = Math.floor(s / side);
  const t = s - seg * side;
  // corners: (-h,-h) → (h,-h) → (h,h) → (-h,h)
  const pts: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const a = pts[seg % 4]!;
  const b = pts[(seg + 1) % 4]!;
  const x = a[0] + ((b[0] - a[0]) * t) / side;
  const z = a[1] + ((b[1] - a[1]) * t) / side;
  let yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  if (dir === -1) yaw += Math.PI;
  return { x, z, yaw };
}

export function Traffic({ half, perLane = 3, speed = 3.2 }: { half: number; perLane?: number; speed?: number }) {
  const lanes = useMemo(
    () =>
      ([1, -1] as const).map((dir, li) => ({
        dir,
        h: half + (dir === 1 ? 0.65 : -0.65),
        speed: speed * (li ? 0.85 : 1),
        cars: Array.from({ length: perLane }, (_, i) => ({ offset: (i / perLane) * (half * 8) + li * 3, color: CAR_COLORS[(i * 3 + li * 5) % CAR_COLORS.length]! })),
      })),
    [half, perLane, speed],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const dist = useRef(0);
  useFrame((_, dt) => {
    dist.current += Math.min(dt, 0.1);
    let k = 0;
    for (const lane of lanes) {
      for (const car of lane.cars) {
        const g = refs.current[k++];
        if (!g) continue;
        const p = onLoop(car.offset + dist.current * lane.speed, lane.h, lane.dir);
        g.position.set(p.x, 0, p.z);
        // ease the turn at corners
        let dy = p.yaw - g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * 10);
      }
    }
  });
  let k = 0;
  return (
    <group>
      {lanes.flatMap((lane) =>
        lane.cars.map((car) => {
          const i = k++;
          return (
            <group key={i} ref={(g) => void (refs.current[i] = g)}>
              <Car color={car.color} />
            </group>
          );
        }),
      )}
    </group>
  );
}
