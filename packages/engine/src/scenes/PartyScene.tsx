import { Backdrop, Ground } from '../environment/Ground';
import { Paths } from '../environment/Paths';
import { flat, glow, GlowDriver } from '../assets/shapes';
import { Crowd } from '../ambient/Crowd';
import { BeatDriver, DanceFloor, SpotBeams } from '../ambient/Party';
import { useEngine } from '../context';

// dancers stand between the hub's four work slots, clear of the walkways
const DANCE_SPOTS: [number, number][] = [35, 55, 125, 145, 215, 235, 305, 325].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * 1.95, Math.sin(a) * 1.95];
});

/** Two dark back walls with a glowing strip along the top. */
function ClubWalls() {
  const { world } = useEngine();
  const R = world.island.radius;
  const wall = flat('#3b2f5c');
  const strip = glow('#9b5de5', 1.2, 2.4, '#9b5de5');
  return (
    <group>
      <mesh position={[0, 1.6, -R + 0.15]} material={wall} receiveShadow castShadow>
        <boxGeometry args={[R * 2, 3.2, 0.3]} />
      </mesh>
      <mesh position={[-R + 0.15, 1.6, 0]} material={wall} receiveShadow castShadow>
        <boxGeometry args={[0.3, 3.2, R * 2]} />
      </mesh>
      <mesh position={[0, 3.05, -R + 0.32]} material={strip}>
        <boxGeometry args={[R * 2, 0.08, 0.04]} />
      </mesh>
      <mesh position={[-R + 0.32, 3.05, 0]} material={strip}>
        <boxGeometry args={[0.04, 0.08, R * 2]} />
      </mesh>
    </group>
  );
}

/** Party: dark club floor, a light-up dance floor, sweeping beams and a crowd dancing round the hub. */
export function PartyScene() {
  return (
    <>
      <Backdrop />
      <Ground />
      <ClubWalls />
      <Paths width={1.3} pebbles={false} plaza={0} />
      <DanceFloor size={6} tile={0.95} />
      <SpotBeams
        positions={[
          [-9, -9],
          [9, -9],
          [-9, 9],
        ]}
      />
      <Crowd count={8} mode="dance" spots={DANCE_SPOTS} colors={['#f7b2d9', '#b2e6f7', '#c9f7b2', '#f7e3b2', '#d7b2f7']} />
      <BeatDriver />
      <GlowDriver />
    </>
  );
}
