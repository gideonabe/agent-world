import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentWorldStoreState } from '@agent-world/core';
import type { EventEnvelope } from '@agent-world/protocol';
import { useEngine } from '../context';
import { BURSTS, ParticlePool, type BurstSpec } from './particles';

type FxKind = 'complete' | 'fail' | 'cancel' | 'stall' | 'spawn' | 'remove';

interface PendingFx {
  agentId: string;
  kind: FxKind;
  color: string;
  /** Give up if the agent never gets a position (ms timestamp). */
  until: number;
  /** Position captured when queued (agents being removed unmount before the next frame). */
  pos?: [number, number];
}

interface Popup {
  id: number;
  position: [number, number, number];
  text: string;
  tone: 'ok' | 'bad' | 'warn' | 'muted';
}

const POPUP_MS = 1700;
const MAX_FRESH = 40;

/**
 * Turns the event log into world-space feedback: confetti, sparks, puffs and
 * floating badges. It watches the store directly (no React re-render per
 * event) and renders every particle with a single InstancedMesh.
 */
export function Effects() {
  const { store, motions, theme } = useEngine();
  const pool = useMemo(() => new ParticlePool(700), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const pending = useRef<PendingFx[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupSeq = useRef(0);
  const height = theme.robot.height;

  useEffect(() => {
    let last: EventEnvelope | undefined = store.getState().log.at(-1);
    const colorOf = (s: AgentWorldStoreState, agentId: string) => {
      const d = s.agents[agentId]?.descriptor;
      return d?.appearance?.color ?? theme.kindColors[d?.kind ?? ''] ?? '#ffffff';
    };
    const queue = (agentId: string, kind: FxKind, color: string) => {
      const m = motions.get(agentId);
      pending.current.push({ agentId, kind, color, until: performance.now() + 1500, ...(m ? { pos: [m.pos[0], m.pos[1]] as [number, number] } : {}) });
    };

    return store.subscribe((s, prev) => {
      if (s.log === prev.log) return;
      const fresh: EventEnvelope[] = [];
      for (let i = s.log.length - 1; i >= 0 && s.log[i] !== last && fresh.length < MAX_FRESH; i--) fresh.push(s.log[i]!);
      last = s.log.at(-1);
      for (const env of fresh.reverse()) {
        const e = env.event;
        switch (e.type) {
          case 'agent.registered':
            if (!prev.agents[e.agent.id]) queue(e.agent.id, 'spawn', colorOf(s, e.agent.id));
            break;
          case 'agent.removed':
            queue(e.agentId, 'remove', '#ffffff');
            break;
          case 'task.completed':
          case 'task.failed':
          case 'task.cancelled':
          case 'task.stalled': {
            const t = s.tasks[e.taskId];
            if (!t) break;
            // only react to the agent's active task (not backlog changes)
            const wasActive = prev.agents[t.agentId]?.currentTaskId === t.id;
            if (!wasActive) break;
            const kind: FxKind =
              e.type === 'task.completed' ? 'complete' : e.type === 'task.failed' ? 'fail' : e.type === 'task.cancelled' ? 'cancel' : 'stall';
            queue(t.agentId, kind, colorOf(s, t.agentId));
            break;
          }
        }
      }
    });
  }, [store, theme, motions]);

  const addPopup = (position: [number, number, number], text: string, tone: Popup['tone']) => {
    const id = ++popupSeq.current;
    setPopups((p) => [...p.slice(-12), { id, position, text, tone }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), POPUP_MS);
  };

  useFrame((_, dt) => {
    // resolve queued effects once the agent has a position
    if (pending.current.length) {
      const now = performance.now();
      const keep: PendingFx[] = [];
      for (const fx of pending.current) {
        const p = motions.get(fx.agentId)?.pos ?? fx.pos;
        if (!p) {
          if (now < fx.until) keep.push(fx);
          continue;
        }
        const at = (y: number): [number, number, number] => [p[0], y, p[1]];
        const burst = (y: number, spec: BurstSpec) => pool.burst(at(y), spec);
        switch (fx.kind) {
          case 'complete':
            burst(height * 0.9, BURSTS.confetti([fx.color, '#ffd166', '#06d6a0', '#ffffff', '#4f9dff']));
            addPopup(at(height + 0.9), '✓', 'ok');
            break;
          case 'fail':
            burst(height * 0.8, BURSTS.sparks());
            burst(height * 0.9, BURSTS.smoke());
            addPopup(at(height + 0.9), '!', 'bad');
            break;
          case 'cancel':
            burst(height * 0.5, BURSTS.poof(0.6));
            addPopup(at(height + 0.9), '–', 'muted');
            break;
          case 'stall':
            addPopup(at(height + 0.9), '?', 'warn');
            break;
          case 'spawn':
            burst(0.4, BURSTS.sparkle(fx.color));
            break;
          case 'remove':
            burst(0.5, BURSTS.poof(1.3));
            break;
        }
      }
      pending.current = keep;
    }

    const m = mesh.current;
    if (!m) return;
    const active = pool.step(Math.min(dt, 0.05));
    if (active || pool.dirtyColors || m.visible) {
      pool.writeTo(m, tmp);
      m.visible = active;
    }
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, pool.max]} frustumCulled={false} castShadow={false} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading roughness={0.6} emissive="#222" />
      </instancedMesh>
      {popups.map((p) => (
        <Html key={p.id} position={p.position} center zIndexRange={[40, 0]} pointerEvents="none">
          <div className={`aw-popup aw-${p.tone}`}>{p.text}</div>
        </Html>
      ))}
      <PopupStyles />
    </>
  );
}

/** Injects the popup keyframes once (engine stays CSS-free for host apps). */
function PopupStyles() {
  useEffect(() => {
    if (document.getElementById('aw-fx-styles')) return;
    const el = document.createElement('style');
    el.id = 'aw-fx-styles';
    el.textContent = `
      .aw-popup { font: 800 18px/1 ui-sans-serif, system-ui, sans-serif; width: 30px; height: 30px; border-radius: 50%;
        display: grid; place-items: center; color: #fff; box-shadow: 0 6px 16px rgba(0,0,0,.25);
        animation: aw-pop ${POPUP_MS}ms cubic-bezier(.2,.9,.3,1.2) forwards; user-select: none; }
      .aw-ok { background: #22c55e; } .aw-bad { background: #f43f5e; } .aw-warn { background: #f59e0b; } .aw-muted { background: #64748b; }
      @keyframes aw-pop {
        0% { transform: translateY(10px) scale(.3); opacity: 0; }
        15% { transform: translateY(0) scale(1.15); opacity: 1; }
        25% { transform: scale(1); }
        75% { opacity: 1; }
        100% { transform: translateY(-34px) scale(.9); opacity: 0; }
      }`;
    document.head.appendChild(el);
  }, []);
  return null;
}
