import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useStore } from 'zustand';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { useEngine } from '../context';
import { resolveModelUrl, type Theme } from '../themes/theme';
import { AgentMotion, type ClipKey } from './agentMotion';
import { intentFor, intentKey, reactionFor } from './intent';
import { labelStyles, STATUS_COLORS } from '../ui/styles';
import { useSelection } from '../selection';

const heightCache = new WeakMap<THREE.Object3D, number>();

export function modelHeight(scene: THREE.Object3D) {
  let h = heightCache.get(scene);
  if (h === undefined) {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    h = Math.max(0.001, box.max.y - box.min.y);
    heightCache.set(scene, h);
  }
  return h;
}

export function clipName(theme: Theme, key: ClipKey) {
  const c = theme.robot.clips;
  if (key.startsWith('work:')) {
    const k = key.slice(5);
    return c.work[k] ?? c.defaultWork;
  }
  return c[key as Exclude<ClipKey, `work:${string}`>];
}

export function Robot({ agentId }: { agentId: string }) {
  const engine = useEngine();
  const { store, theme, nav, motions } = engine;
  const agent = useStore(store, (s) => s.agents[agentId]);
  const task = useStore(store, (s) => {
    const id = s.agents[agentId]?.currentTaskId;
    return id ? s.tasks[id] : undefined;
  });
  const { selectedId, select } = useSelection();
  const selected = selectedId === agentId;

  const gltf = useGLTF(resolveModelUrl(theme, agent?.descriptor.appearance?.model ?? theme.robot.url));
  const color = agent?.descriptor.appearance?.color ?? theme.kindColors[agent?.descriptor.kind ?? ''] ?? '#9ca3af';

  const { scene, scale } = useMemo(() => {
    const s = cloneSkinned(gltf.scene);
    const tint = new THREE.Color(color);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        if (theme.robot.tintMaterials.includes(mat.name)) {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          c.color = tint.clone();
          return c;
        }
        return mat;
      });
      m.material = Array.isArray(m.material) ? next : next[0]!;
    });
    const h = modelHeight(gltf.scene);
    return { scene: s, scale: (theme.robot.height / h) * (agent?.descriptor.appearance?.scale ?? 1) };
    // agent appearance changes rebuild the clone
  }, [gltf.scene, color, theme, agent?.descriptor.appearance?.scale]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const { actions } = useAnimations(gltf.animations, body);

  const motion = useMemo(() => {
    const m = new AgentMotion(agentId, nav, { walkSpeed: theme.robot.walkSpeed, runSpeed: theme.robot.runSpeed });
    return m;
  }, [agentId, nav, theme]);

  useEffect(() => {
    motions.set(agentId, motion);
    return () => void motions.delete(agentId);
  }, [agentId, motion, motions]);

  // Logical state -> motion intent (only when it actually changes)
  const key = agent ? intentKey(agent, task) : '';
  useEffect(() => {
    if (agent) motion.setIntent(intentFor(agent, task, engine.world, nav));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, motion]);

  // Finished tasks trigger a one-shot reaction (skip outcomes that predate mount)
  const outcomeAt = agent?.lastOutcome?.at;
  const mountedAt = useRef(outcomeAt);
  useEffect(() => {
    const o = agent?.lastOutcome;
    if (!o || o.at === mountedAt.current) return;
    motion.react(reactionFor(o.result));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeAt, motion]);

  const current = useRef<string | null>(null);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    motion.update(dt, motions.values());
    const g = root.current;
    if (!g) return;
    g.position.set(motion.pos[0], 0.04, motion.pos[1]);
    if (body.current) body.current.rotation.y = motion.heading;

    // pop-in
    const t = Math.min(1, motion.age / 0.6);
    const pop = t < 1 ? 1 - Math.pow(1 - t, 3) * Math.cos(t * 9) : 1;
    g.scale.setScalar(Math.max(0.001, pop));

    const name = clipName(theme, motion.clip);
    if (name !== current.current) {
      const next = actions[name];
      const prev = current.current ? actions[current.current] : undefined;
      if (next) {
        next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
        prev?.fadeOut(0.25);
        current.current = name;
      }
    }
    const a = current.current ? actions[current.current] : undefined;
    if (a && (motion.clip === 'walk' || motion.clip === 'run')) {
      const base = motion.clip === 'run' ? theme.robot.runSpeed : theme.robot.walkSpeed;
      a.timeScale = THREE.MathUtils.clamp(motion.speed / base, 0.4, 1.3);
    } else if (a) a.timeScale = 1;

    if (ring.current) {
      ring.current.visible = selected;
      if (selected) ring.current.scale.setScalar(1 + Math.sin(performance.now() / 250) * 0.08);
    }
  });

  const [hover, setHover] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : '';
    return () => void (document.body.style.cursor = '');
  }, [hover]);

  if (!agent) return null;
  const statusColor = STATUS_COLORS[agent.status];
  const showBar = task && (agent.status === 'working' || agent.status === 'assigned');

  return (
    <group
      ref={root}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(selected ? null : agentId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <group ref={body}>
        <primitive object={scene} scale={scale} />
      </group>
      {/* invisible hit box: cheaper and easier to click than the skinned mesh */}
      <mesh position-y={theme.robot.height / 2} visible={false}>
        <cylinderGeometry args={[0.4, 0.4, theme.robot.height, 8]} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03} visible={false}>
        <ringGeometry args={[0.45, 0.58, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <Html position={[0, theme.robot.height + 0.45, 0]} center zIndexRange={[30, 0]} pointerEvents="none">
        <div style={labelStyles.agent(selected)}>
          <div style={labelStyles.agentRow}>
            <span style={labelStyles.dot(statusColor)} />
            <span style={{ fontWeight: 650 }}>{agent.descriptor.name}</span>
            {agent.taskQueue.length > 0 && <span style={labelStyles.queue}>+{agent.taskQueue.length}</span>}
          </div>
          {showBar && (
            <div style={labelStyles.bar}>
              <div style={labelStyles.barFill(task.progress, color)} />
            </div>
          )}
          {selected && task?.message && !task.stalled && <span style={{ opacity: 0.75, fontSize: 11 }}>{task.message}</span>}
          {task?.stalled && <span style={{ color: '#fbbf24', fontSize: 11 }}>stalled…</span>}
          {agent.status === 'failed' && <span style={{ color: STATUS_COLORS.failed, fontSize: 11 }}>failed</span>}
          {agent.status === 'completed' && <span style={{ color: STATUS_COLORS.completed, fontSize: 11 }}>done ✓</span>}
        </div>
      </Html>
    </group>
  );
}

export function preloadRobot(theme: Theme) {
  useGLTF.preload(resolveModelUrl(theme, theme.robot.url));
}
