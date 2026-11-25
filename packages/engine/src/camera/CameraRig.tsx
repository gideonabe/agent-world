import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
import { useEngine } from '../context';
import { useSelection } from '../selection';

const INTRO_SECONDS = 2.6;

/**
 * Miniature-diorama camera: constrained orbit, intro dolly, and smooth
 * follow of the selected agent (keeps the user's orbit offset).
 */
export function CameraRig() {
  const { world, motions } = useEngine();
  const { selectedId } = useSelection();
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const R = world.island.radius;
  const intro = useRef({ t: 0, done: false });
  const restPos = useRef(new THREE.Vector3(R * 1.25, R * 1.1, R * 1.4));
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(R * 2.4, R * 2.2, R * 2.7);
    camera.lookAt(0, 0, 0);
  }, [camera, R]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const it = intro.current;
    if (!it.done) {
      it.t += dt;
      const k = Math.min(1, it.t / INTRO_SECONDS);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerp(restPos.current, e * 0.12 + 0.02);
      if (k >= 1 || camera.position.distanceTo(restPos.current) < 0.05) it.done = true;
    }

    const m = selectedId ? motions.get(selectedId) : undefined;
    if (m) {
      const target = tmp.current.set(m.pos[0], 0.6, m.pos[1]);
      const delta = target.sub(c.target).multiplyScalar(Math.min(1, dt * 3));
      c.target.add(delta);
      camera.position.add(delta);
    } else {
      // keep the target on the island
      const len = Math.hypot(c.target.x, c.target.z);
      if (len > R * 0.8) {
        const s = (R * 0.8) / len;
        c.target.x *= s;
        c.target.z *= s;
      }
      c.target.y += (0 - c.target.y) * Math.min(1, dt * 2);
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={R * 3.4}
      minPolarAngle={0.3}
      maxPolarAngle={1.22}
      onStart={() => (intro.current.done = true)}
    />
  );
}
