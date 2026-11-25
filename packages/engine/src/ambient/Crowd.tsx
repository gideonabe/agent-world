import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Vec2 } from '@agent-viz/protocol';
import { useEngine } from '../context';
import { resolveModelUrl } from '../themes/theme';
import { AgentMotion } from '../characters/agentMotion';
import { clipName, modelHeight } from '../characters/Robot';
import { mulberry32 } from '../math';

export interface CrowdProps {
  count: number;
  /** "wander": stroll between walkway nodes (office, market). "dance": dance on the spot around `spots`. */
  mode?: 'wander' | 'dance';
  /** Where dancers stand (world x/z). Defaults to a ring around the home station. */
  spots?: Vec2[];
  /** Soft colours for the extras, so they read as background next to the agents' bright kind colours. */
  colors?: string[];
  scale?: number;
}

const DEFAULT_COLORS = ['#cbd2da', '#d8cfc4', '#c9d6cf', '#d6cbd9', '#cfd8e3'];

/**
 * Background extras: unlabelled, unclickable robots that make a world feel busy. They are not agents and
 * never touch the store; agents walk around them like any other robot.
 */
export function Crowd({ count, mode = 'wander', spots, colors = DEFAULT_COLORS, scale = 0.88 }: CrowdProps) {
  const { world } = useEngine();
  const crowd = useRef(new Map<string, AgentMotion>());
  const home = world.stations.find((s) => s.id === world.homeStationId);
  const places = useMemo(() => {
    if (mode !== 'dance') return [];
    if (spots?.length) return spots;
    const c = home?.position ?? [0, 0];
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const r = 2.4 + (i % 2) * 0.9;
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Vec2;
    });
  }, [mode, spots, count, home]);
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <Extra key={i} index={i} crowd={crowd.current} color={colors[i % colors.length]!} scale={scale} {...(places[i % (places.length || 1)] && mode === 'dance' ? { spot: places[i % places.length]! } : {})} />
      ))}
    </group>
  );
}

function Extra({ index, crowd, color, scale, spot }: { index: number; crowd: Map<string, AgentMotion>; color: string; scale: number; spot?: Vec2 }) {
  const { theme, nav, motions, world } = useEngine();
  const gltf = useGLTF(resolveModelUrl(theme, theme.robot.url));
  const id = `extra-${world.id}-${index}`;
  const { scene, s } = useMemo(() => {
    const sc = cloneSkinned(gltf.scene);
    const tint = new THREE.Color(color);
    sc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        if (!theme.robot.tintMaterials.includes(mat.name)) return mat;
        const c = (mat as THREE.MeshStandardMaterial).clone();
        c.color = tint.clone();
        return c;
      });
      m.material = Array.isArray(m.material) ? next : next[0]!;
    });
    return { scene: sc, s: (theme.robot.height / modelHeight(gltf.scene)) * scale };
  }, [gltf.scene, color, theme, scale]);

  const body = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, body);
  const motion = useMemo(() => {
    const m = new AgentMotion(id, nav, { walkSpeed: theme.robot.walkSpeed * 0.8, runSpeed: theme.robot.runSpeed }, spot);
    if (spot) {
      const rnd = mulberry32(index * 31 + 7);
      m.heading = m.targetHeading = rnd() * Math.PI * 2;
      m.setIntent({ type: 'workHere', workClip: 'dance' });
    }
    m.age = 1.5; // skip most of the pop-in wave
    return m;
  }, [id, nav, theme, spot, index]);

  useEffect(() => {
    crowd.set(id, motion);
    return () => void crowd.delete(id);
  }, [crowd, id, motion]);

  const current = useRef<string | null>(null);
  const all = useMemo(() => ({ *[Symbol.iterator]() { yield* crowd.values(); yield* motions.values(); } }), [crowd, motions]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    motion.update(dt, all);
    if (root.current) root.current.position.set(motion.pos[0], 0.04, motion.pos[1]);
    if (body.current) body.current.rotation.y = motion.heading;
    const name = clipName(theme, motion.clip);
    if (name !== current.current) {
      const next = actions[name];
      if (next) {
        next.reset().fadeIn(0.3).play();
        if (current.current) actions[current.current]?.fadeOut(0.3);
        current.current = name;
      }
    }
  });

  return (
    <group ref={root} raycast={() => null}>
      <group ref={body}>
        <primitive object={scene} scale={s} />
      </group>
    </group>
  );
}
