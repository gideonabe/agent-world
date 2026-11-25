import { useMemo, useRef, type ComponentType } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../math';
import { useEngine } from '../context';

/**
 * Built-in low-poly shapes used by the City, Market and Party worlds. World props reference them as
 * `shape/<name>` (with optional `color` and `variant`), so worlds stay plain data and need no downloads.
 * Sizes are in world units (a robot is about 1.35 tall); every shape stands on y = 0, centred on x/z.
 */

// --- shared materials ----------------------------------------------------------------------------------

const flatCache = new Map<string, THREE.MeshStandardMaterial>();
/** One shared flat-shaded material per colour. */
export function flat(color: string, roughness = 0.85) {
  const key = `${color}|${roughness}`;
  let m = flatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });
    flatCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, { mat: THREE.MeshStandardMaterial; day: number; night: number }>();
/**
 * A material that lights up at night (windows, lamps, neon). `day`/`night` are emissive intensities;
 * <GlowDriver/> updates every glow material once per frame.
 */
export function glow(color: string, day = 0.15, night = 1.6, base = '#ffffff') {
  const key = `${color}|${day}|${night}|${base}`;
  let g = glowCache.get(key);
  if (!g) {
    g = { mat: new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: day, flatShading: true, roughness: 0.6 }), day, night };
    glowCache.set(key, g);
  }
  return g.mat;
}

/** Mount once per scene that uses glow materials. */
export function GlowDriver() {
  const { ambience } = useEngine();
  useFrame(() => {
    const n = ambience.night;
    for (const g of glowCache.values()) g.mat.emissiveIntensity = g.day + (g.night - g.day) * n;
  });
  return null;
}

const Box = ({ size, pos, mat, cast = true }: { size: [number, number, number]; pos: [number, number, number]; mat: THREE.Material; cast?: boolean }) => (
  <mesh position={pos} material={mat} castShadow={cast} receiveShadow>
    <boxGeometry args={size} />
  </mesh>
);

const Cyl = ({ r, h, pos, mat, seg = 10, r2 }: { r: number; h: number; pos: [number, number, number]; mat: THREE.Material; seg?: number; r2?: number }) => (
  <mesh position={pos} material={mat} castShadow receiveShadow>
    <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
  </mesh>
);

const pick = <T,>(list: T[], rnd: () => number) => list[Math.floor(rnd() * list.length) % list.length]!;

// --- city ----------------------------------------------------------------------------------------------

const BUILDING_COLORS = ['#e9d8c4', '#c9d6e3', '#e7c6b8', '#d5e0c8', '#f0e2b6', '#cfc7e6', '#bfcfd8'];

/** A city building with a window grid on its front and side, a roof ledge and rooftop clutter. */
function Building({ color, variant = 0 }: { color?: string; variant?: number }) {
  const rnd = mulberry32(9001 + variant * 977);
  const w = 2.6 + rnd() * 1.0;
  const d = 2.6 + rnd() * 0.8;
  const floors = 2 + Math.floor(rnd() * 5);
  const h = 0.9 + floors * 0.95;
  const body = flat(color ?? pick(BUILDING_COLORS, rnd));
  const trim = flat('#7b8794');
  const win = glow('#ffd27a', 0.05, 1.5, '#9fb7c9');
  const windows = useMemo(() => {
    const out: { pos: [number, number, number]; rotY: number }[] = [];
    const cols = Math.max(2, Math.floor(w / 0.8));
    const colsSide = Math.max(2, Math.floor(d / 0.8));
    for (let f = 0; f < floors; f++) {
      const y = 1.1 + f * 0.95;
      for (let c = 0; c < cols; c++) out.push({ pos: [-w / 2 + (w / cols) * (c + 0.5), y, d / 2 + 0.01], rotY: 0 });
      for (let c = 0; c < colsSide; c++) out.push({ pos: [w / 2 + 0.01, y, -d / 2 + (d / colsSide) * (c + 0.5)], rotY: Math.PI / 2 });
    }
    return out;
  }, [w, d, floors]);
  return (
    <group>
      <Box size={[w, h, d]} pos={[0, h / 2, 0]} mat={body} />
      <Box size={[w + 0.16, 0.16, d + 0.16]} pos={[0, h + 0.08, 0]} mat={trim} />
      <Box size={[0.7, 0.4, 0.6]} pos={[w * 0.18, h + 0.36, -d * 0.15]} mat={trim} />
      {/* door */}
      <Box size={[0.6, 0.95, 0.06]} pos={[0, 0.475, d / 2 + 0.02]} mat={flat('#5b4a3f')} cast={false} />
      {windows.map((wi, i) => (
        <mesh key={i} position={wi.pos} rotation-y={wi.rotY} material={win}>
          <planeGeometry args={[0.42, 0.52]} />
        </mesh>
      ))}
    </group>
  );
}

/** A small shop with a striped awning and a big shop window. */
function Shop({ color, variant = 0 }: { color?: string; variant?: number }) {
  const rnd = mulberry32(31 + variant * 131);
  const w = 2.8;
  const d = 2.2;
  const h = 2.0;
  const awning = pick(['#e4572e', '#2e86ab', '#4caf50', '#f2a541', '#9c27b0'], rnd);
  return (
    <group>
      <Box size={[w, h, d]} pos={[0, h / 2, 0]} mat={flat(color ?? pick(BUILDING_COLORS, rnd))} />
      <Box size={[w + 0.12, 0.14, d + 0.12]} pos={[0, h + 0.07, 0]} mat={flat('#7b8794')} />
      <mesh position={[0.3, 0.95, d / 2 + 0.01]} material={glow('#ffe2a8', 0.12, 1.2, '#b8d4e3')}>
        <planeGeometry args={[1.5, 0.9]} />
      </mesh>
      <Box size={[0.55, 1.0, 0.05]} pos={[-0.95, 0.5, d / 2 + 0.02]} mat={flat('#5b4a3f')} cast={false} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[-w / 2 + (w / 6) * (i + 0.5), 1.62, d / 2 + 0.32]} rotation-x={0.45} material={flat(i % 2 ? '#ffffff' : awning)} castShadow>
          <boxGeometry args={[w / 6, 0.05, 0.75]} />
        </mesh>
      ))}
    </group>
  );
}

/** A little car. Also used by moving traffic. */
export function Car({ color = '#e4572e' }: { color?: string }) {
  const tyre = flat('#2b2d31');
  const glass = flat('#9fc5dc', 0.3);
  return (
    <group>
      <Box size={[1.7, 0.42, 0.86]} pos={[0, 0.38, 0]} mat={flat(color, 0.5)} />
      <Box size={[0.95, 0.38, 0.78]} pos={[-0.1, 0.78, 0]} mat={glass} />
      <Box size={[0.98, 0.06, 0.8]} pos={[-0.1, 0.99, 0]} mat={flat(color, 0.5)} />
      {[
        [0.55, 0.43],
        [0.55, -0.43],
        [-0.55, 0.43],
        [-0.55, -0.43],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 0.2, z!]} rotation-x={Math.PI / 2} material={tyre} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 10]} />
        </mesh>
      ))}
      <Box size={[0.04, 0.1, 0.18]} pos={[0.86, 0.42, 0.27]} mat={glow('#fff4c2', 0.4, 2.2)} cast={false} />
      <Box size={[0.04, 0.1, 0.18]} pos={[0.86, 0.42, -0.27]} mat={glow('#fff4c2', 0.4, 2.2)} cast={false} />
      <Box size={[0.04, 0.1, 0.16]} pos={[-0.86, 0.42, 0.28]} mat={glow('#ff4040', 0.3, 1.6)} cast={false} />
      <Box size={[0.04, 0.1, 0.16]} pos={[-0.86, 0.42, -0.28]} mat={glow('#ff4040', 0.3, 1.6)} cast={false} />
    </group>
  );
}

function StreetLamp() {
  const pole = flat('#4a5563');
  return (
    <group>
      <Cyl r={0.07} h={2.6} pos={[0, 1.3, 0]} mat={pole} seg={6} />
      <Box size={[0.5, 0.06, 0.08]} pos={[0.22, 2.58, 0]} mat={pole} />
      <Box size={[0.26, 0.14, 0.26]} pos={[0.42, 2.5, 0]} mat={glow('#ffe7a3', 0.1, 2.6)} />
      <Cyl r={0.16} h={0.12} pos={[0, 0.06, 0]} mat={pole} seg={6} />
    </group>
  );
}

function Fountain() {
  const stone = flat('#cfd6dd');
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = 0.42 + Math.sin(clock.elapsedTime * 2) * 0.02;
  });
  return (
    <group>
      <Cyl r={1.5} h={0.4} pos={[0, 0.2, 0]} mat={stone} seg={12} />
      <mesh ref={water} position={[0, 0.42, 0]} material={flat('#5fb7d9', 0.2)}>
        <cylinderGeometry args={[1.32, 1.32, 0.06, 12]} />
      </mesh>
      <Cyl r={0.22} h={1.1} pos={[0, 0.75, 0]} mat={stone} seg={8} />
      <Cyl r={0.55} h={0.14} pos={[0, 1.3, 0]} mat={stone} seg={10} />
      <mesh position={[0, 1.55, 0]} material={glow('#9be7ff', 0.4, 1.4, '#c9f1ff')}>
        <sphereGeometry args={[0.18, 8, 6]} />
      </mesh>
    </group>
  );
}

function Hydrant() {
  const red = flat('#d64045');
  return (
    <group>
      <Cyl r={0.12} h={0.45} pos={[0, 0.225, 0]} mat={red} seg={8} />
      <Cyl r={0.14} h={0.08} pos={[0, 0.48, 0]} mat={red} seg={8} />
      <Box size={[0.36, 0.08, 0.08]} pos={[0, 0.3, 0]} mat={red} />
    </group>
  );
}

function TrafficCone() {
  return (
    <group>
      <Box size={[0.36, 0.04, 0.36]} pos={[0, 0.02, 0]} mat={flat('#f36f21')} />
      <mesh position={[0, 0.27, 0]} material={flat('#f36f21')} castShadow>
        <coneGeometry args={[0.13, 0.5, 8]} />
      </mesh>
      <Cyl r={0.085} h={0.07} r2={0.07} pos={[0, 0.3, 0]} mat={flat('#ffffff')} seg={8} />
    </group>
  );
}

/** A billboard on two posts with a glowing panel. */
function Billboard({ color = '#4f9dff' }: { color?: string }) {
  const post = flat('#56606c');
  return (
    <group>
      <Box size={[0.12, 2.4, 0.12]} pos={[-0.9, 1.2, 0]} mat={post} />
      <Box size={[0.12, 2.4, 0.12]} pos={[0.9, 1.2, 0]} mat={post} />
      <Box size={[2.4, 1.2, 0.12]} pos={[0, 2.6, 0]} mat={post} />
      <mesh position={[0, 2.6, 0.07]} material={glow(color, 0.6, 2.0, color)}>
        <planeGeometry args={[2.2, 1.0]} />
      </mesh>
    </group>
  );
}

// --- market --------------------------------------------------------------------------------------------

const PRODUCE = ['#e63946', '#f4a261', '#ffd166', '#2a9d8f', '#8ac926', '#9b5de5', '#ff7b00'];

/** A wooden crate, optionally heaped with produce. */
function Crate({ variant = 0, color }: { variant?: number; color?: string }) {
  const rnd = mulberry32(77 + variant * 19);
  const wood = flat('#b98552');
  const fruit = color ?? pick(PRODUCE, rnd);
  const heap = useMemo(() => Array.from({ length: 7 }, () => [(rnd() - 0.5) * 0.4, 0.5 + rnd() * 0.08, (rnd() - 0.5) * 0.3] as [number, number, number]), [rnd]);
  return (
    <group>
      <Box size={[0.62, 0.42, 0.46]} pos={[0, 0.21, 0]} mat={wood} />
      <Box size={[0.66, 0.06, 0.5]} pos={[0, 0.44, 0]} mat={flat('#9c6b3f')} cast={false} />
      {variant % 3 !== 2 &&
        heap.map((p, i) => (
          <mesh key={i} position={p} material={flat(fruit, 0.5)} castShadow>
            <icosahedronGeometry args={[0.11, 0]} />
          </mesh>
        ))}
    </group>
  );
}

/** A market stall: counter, four posts, a striped awning, and goods on the counter. */
function Stall({ color = '#e4572e', variant = 0 }: { color?: string; variant?: number }) {
  const rnd = mulberry32(501 + variant * 37);
  const wood = flat('#a8754a');
  const goods = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        pos: [-0.95 + (i % 5) * 0.48, 1.0, -0.25 + Math.floor(i / 5) * 0.38] as [number, number, number],
        c: pick(PRODUCE, rnd),
        s: 0.1 + rnd() * 0.05,
      })),
    [rnd],
  );
  return (
    <group>
      <Box size={[2.6, 0.9, 1.0]} pos={[0, 0.45, -0.1]} mat={wood} />
      <Box size={[2.7, 0.08, 1.1]} pos={[0, 0.92, -0.1]} mat={flat('#c89a6a')} cast={false} />
      {[
        [-1.25, 0.45],
        [1.25, 0.45],
        [-1.25, -0.65],
        [1.25, -0.65],
      ].map(([x, z], i) => (
        <Box key={i} size={[0.08, 2.3, 0.08]} pos={[x!, 1.15, z!]} mat={wood} />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} position={[-1.3 + (2.6 / 7) * (i + 0.5), 2.35, -0.1]} rotation-x={-0.18} material={flat(i % 2 ? '#fffaf0' : color)} castShadow>
          <boxGeometry args={[2.6 / 7, 0.06, 1.6]} />
        </mesh>
      ))}
      {goods.map((g, i) => (
        <mesh key={i} position={g.pos} material={flat(g.c, 0.5)} castShadow>
          <icosahedronGeometry args={[g.s, 0]} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, 0.46]} material={glow('#ffe2a8', 0.2, 1.4, '#fff3d6')}>
        <boxGeometry args={[1.2, 0.26, 0.04]} />
      </mesh>
    </group>
  );
}

/** A café table under a parasol. */
function Parasol({ color = '#2a9d8f' }: { color?: string }) {
  const white = flat('#f4f1ea');
  return (
    <group>
      <Cyl r={0.35} h={0.05} pos={[0, 0.7, 0]} mat={white} seg={10} />
      <Cyl r={0.04} h={0.7} pos={[0, 0.35, 0]} mat={flat('#555')} seg={6} />
      <Cyl r={0.04} h={2.1} pos={[0, 1.05, 0]} mat={flat('#555')} seg={6} />
      <mesh position={[0, 2.05, 0]} material={flat(color)} castShadow>
        <coneGeometry args={[1.1, 0.45, 8]} />
      </mesh>
    </group>
  );
}

/** A row of hanging light bulbs between two posts. */
function StringLights({ variant = 0 }: { variant?: number }) {
  const len = 3 + (variant % 4);
  const post = flat('#6b5444');
  const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'];
  return (
    <group>
      <Box size={[0.08, 2.6, 0.08]} pos={[-len / 2, 1.3, 0]} mat={post} />
      <Box size={[0.08, 2.6, 0.08]} pos={[len / 2, 1.3, 0]} mat={post} />
      {Array.from({ length: Math.round(len * 3) }, (_, i) => {
        const t = (i + 0.5) / Math.round(len * 3);
        const x = -len / 2 + t * len;
        const y = 2.5 - Math.sin(t * Math.PI) * 0.35;
        return (
          <mesh key={i} position={[x, y, 0]} material={glow(colors[i % colors.length]!, 0.8, 2.4, colors[i % colors.length]!)}>
            <sphereGeometry args={[0.07, 6, 4]} />
          </mesh>
        );
      })}
    </group>
  );
}

// --- party ---------------------------------------------------------------------------------------------

/** Spinning mirror ball hanging from a truss. */
function DiscoBall() {
  const ball = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ball.current) ball.current.rotation.y += dt * 0.8;
  });
  const truss = flat('#3a3f4a');
  return (
    <group>
      <Box size={[0.1, 4.2, 0.1]} pos={[-1.6, 2.1, 0]} mat={truss} />
      <Box size={[0.1, 4.2, 0.1]} pos={[1.6, 2.1, 0]} mat={truss} />
      <Box size={[3.3, 0.1, 0.1]} pos={[0, 4.2, 0]} mat={truss} />
      <Box size={[0.02, 0.5, 0.02]} pos={[0, 3.9, 0]} mat={truss} cast={false} />
      <mesh ref={ball} position={[0, 3.45, 0]} castShadow>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial color="#e8edf5" metalness={0.9} roughness={0.15} flatShading emissive="#8899ff" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

/** Speaker stack with glowing cones. */
function SpeakerStack({ color = '#ef476f' }: { color?: string }) {
  const body = flat('#23262d');
  const cone = glow(color, 0.4, 1.4, '#2f333b');
  return (
    <group>
      <Box size={[0.9, 1.0, 0.7]} pos={[0, 0.5, 0]} mat={body} />
      <Box size={[0.8, 0.8, 0.65]} pos={[0, 1.4, 0]} mat={body} />
      <mesh position={[0, 0.5, 0.36]} material={cone}>
        <circleGeometry args={[0.32, 12]} />
      </mesh>
      <mesh position={[0, 1.4, 0.335]} material={cone}>
        <circleGeometry args={[0.25, 12]} />
      </mesh>
    </group>
  );
}

/** DJ booth: a deck with two spinning turntables and a light strip. */
function DjBooth() {
  const t1 = useRef<THREE.Mesh>(null);
  const t2 = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (t1.current) t1.current.rotation.y += dt * 4;
    if (t2.current) t2.current.rotation.y -= dt * 4;
  });
  const vinyl = flat('#111318', 0.4);
  return (
    <group>
      <Box size={[2.2, 0.95, 0.9]} pos={[0, 0.475, 0]} mat={flat('#2b2f3a')} />
      <Box size={[2.25, 0.08, 0.06]} pos={[0, 0.7, 0.46]} mat={glow('#9b5de5', 1.0, 2.6, '#9b5de5')} cast={false} />
      <Box size={[2.3, 0.06, 1.0]} pos={[0, 0.98, 0]} mat={flat('#3c4250')} />
      <mesh ref={t1} position={[-0.6, 1.03, 0]} material={vinyl}>
        <cylinderGeometry args={[0.28, 0.28, 0.03, 16]} />
      </mesh>
      <mesh ref={t2} position={[0.6, 1.03, 0]} material={vinyl}>
        <cylinderGeometry args={[0.28, 0.28, 0.03, 16]} />
      </mesh>
      <Box size={[0.4, 0.06, 0.3]} pos={[0, 1.04, 0]} mat={glow('#06d6a0', 0.8, 2, '#1d3b35')} cast={false} />
    </group>
  );
}

/** A bunch of balloons that bob gently. */
function Balloons({ variant = 0 }: { variant?: number }) {
  const rnd = mulberry32(13 + variant * 7);
  const g = useRef<THREE.Group>(null);
  const phase = rnd() * 6;
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = Math.sin(clock.elapsedTime * 1.3 + phase) * 0.08;
  });
  const balloons = useMemo(
    () => Array.from({ length: 4 }, () => ({ x: (rnd() - 0.5) * 0.6, y: 1.9 + rnd() * 0.5, z: (rnd() - 0.5) * 0.6, c: pick(['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'], rnd) })),
    [rnd],
  );
  return (
    <group>
      <Box size={[0.18, 0.12, 0.18]} pos={[0, 0.06, 0]} mat={flat('#555')} />
      <group ref={g}>
        {balloons.map((b, i) => (
          <group key={i}>
            <mesh position={[b.x, b.y, b.z]} scale={[1, 1.2, 1]} material={flat(b.c, 0.35)} castShadow>
              <sphereGeometry args={[0.22, 10, 8]} />
            </mesh>
            <mesh position={[b.x / 2, b.y / 2, b.z / 2]} rotation={[b.z * 0.4, 0, -b.x * 0.4]} material={flat('#dddddd')}>
              <cylinderGeometry args={[0.006, 0.006, b.y, 3]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** A party table with cups and a snack bowl. */
function PartyTable({ color = '#ef476f' }: { color?: string }) {
  const rnd = mulberry32(5);
  return (
    <group>
      <Cyl r={0.6} h={0.06} pos={[0, 0.75, 0]} mat={flat(color)} seg={14} />
      <Cyl r={0.06} h={0.75} pos={[0, 0.375, 0]} mat={flat('#555')} seg={6} />
      <Cyl r={0.3} h={0.05} pos={[0, 0.03, 0]} mat={flat('#555')} seg={8} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + rnd();
        return <Cyl key={i} r={0.06} r2={0.075} h={0.16} pos={[Math.cos(a) * 0.38, 0.86, Math.sin(a) * 0.38]} mat={flat(pick(['#ffffff', '#ffd166', '#06d6a0'], rnd))} seg={8} />;
      })}
      <Cyl r={0.14} r2={0.2} h={0.1} pos={[0, 0.83, 0]} mat={flat('#f4f1ea')} seg={10} />
    </group>
  );
}

/** A glowing sign on a post, e.g. above an entrance. */
function NeonSign({ color = '#ef476f' }: { color?: string }) {
  return (
    <group>
      <Box size={[0.08, 2.2, 0.08]} pos={[0, 1.1, 0]} mat={flat('#3a3f4a')} />
      <mesh position={[0, 2.4, 0]} material={glow(color, 1.2, 2.8, color)} castShadow>
        <boxGeometry args={[1.4, 0.45, 0.12]} />
      </mesh>
    </group>
  );
}

// --- registry ------------------------------------------------------------------------------------------

export interface ShapeProps {
  color?: string;
  variant?: number;
}

const SHAPES: Record<string, ComponentType<ShapeProps>> = {
  building: Building,
  shop: Shop,
  car: Car,
  streetLamp: StreetLamp,
  fountain: Fountain,
  hydrant: Hydrant,
  cone: TrafficCone,
  billboard: Billboard,
  crate: Crate,
  stall: Stall,
  parasol: Parasol,
  stringLights: StringLights,
  discoBall: DiscoBall,
  speakers: SpeakerStack,
  djBooth: DjBooth,
  balloons: Balloons,
  partyTable: PartyTable,
  neon: NeonSign,
};

export const SHAPE_PREFIX = 'shape/';
export const isShape = (model: string) => model.startsWith(SHAPE_PREFIX);

/** Renders a built-in shape by key ("shape/stall"); unknown keys render nothing. */
export function Shape({ model, color, variant }: { model: string } & ShapeProps) {
  const C = SHAPES[model.slice(SHAPE_PREFIX.length)];
  return C ? <C {...(color ? { color } : {})} {...(variant !== undefined ? { variant } : {})} /> : null;
}

export const shapeNames = Object.keys(SHAPES);
