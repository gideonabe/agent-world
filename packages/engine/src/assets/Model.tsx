import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { PropPlacement } from '@agent-world/protocol';
import { useEngine } from '../context';
import { resolveModelUrl } from '../themes/theme';

const offsets = new WeakMap<THREE.Object3D, THREE.Vector3>();
const prepared = new WeakSet<THREE.Object3D>();

/**
 * One-time material fix-up per asset: many CC0 packs export metallic=1, which
 * renders black without an environment map. Also applies theme colour overrides.
 */
export function prepareMaterials(scene: THREE.Object3D, overrides: Record<string, string> = {}) {
  if (prepared.has(scene)) return;
  prepared.add(scene);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial) {
        if (!std.metalnessMap && std.metalness > 0.5) std.metalness = 0;
        std.roughness = Math.max(std.roughness, 0.7);
        const c = overrides[std.name];
        if (c) std.color.set(c);
      }
    }
  });
}

/** Offset that centers a model on XZ and puts its base on y=0 (cached per asset). */
function normalizeOffset(scene: THREE.Object3D) {
  let o = offsets.get(scene);
  if (!o) {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    o = new THREE.Vector3(-c.x, -box.min.y, -c.z);
    offsets.set(scene, o);
  }
  return o;
}

export interface ModelProps {
  /** Theme model key or URL. */
  model: string;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Renders a normalized clone of a GLB. Geometry and materials are shared
 * between clones, so many instances stay cheap on memory.
 */
export function Model({ model, position = [0, 0, 0], rotation = 0, scale = 1, castShadow = true, receiveShadow = true }: ModelProps) {
  const { theme } = useEngine();
  const gltf = useGLTF(resolveModelUrl(theme, model));
  const { clone, offset } = useMemo(() => {
    prepareMaterials(gltf.scene, theme.materialColors);
    const c = gltf.scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = castShadow;
        m.receiveShadow = receiveShadow;
      }
    });
    return { clone: c, offset: normalizeOffset(gltf.scene) };
  }, [gltf.scene, castShadow, receiveShadow, theme.materialColors]);

  return (
    <group position={position} rotation-y={rotation} scale={scale}>
      <primitive object={clone} position={offset} />
    </group>
  );
}

/** Places a world/station prop using the theme's prop scale. */
export function Prop({ prop, baseScale }: { prop: PropPlacement; baseScale: number }) {
  return (
    <Model
      model={prop.model}
      position={[prop.position[0], prop.y ?? 0, prop.position[1]]}
      rotation={prop.rotation ?? 0}
      scale={baseScale * (prop.scale ?? 1)}
      castShadow={prop.castShadow ?? true}
    />
  );
}

export function preloadModels(urls: string[]) {
  for (const u of urls) useGLTF.preload(u);
}
