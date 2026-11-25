import { useGLTF } from '@react-three/drei';
import type { WorldConfig } from '@agent-world/protocol';
import { resolveModelUrl, type Theme } from '../themes/theme';

/** Every model URL a world + theme can reference. */
export function collectModelUrls(world: WorldConfig, theme: Theme): string[] {
  const keys = new Set<string>([theme.robot.url]);
  for (const s of world.stations) for (const p of s.props ?? []) keys.add(p.model);
  for (const p of world.props ?? []) keys.add(p.model);
  const d = theme.decor;
  for (const [k] of [...d.trees, ...d.rocks, ...d.plants, ...d.shoreline]) keys.add(k);
  return [...keys].map((k) => resolveModelUrl(theme, k));
}

const done = new Set<string>();

/**
 * Starts all downloads in parallel. Without this, React 19 suspends on the
 * first missing model and fetches the rest one after another (a waterfall).
 */
export function preloadWorldAssets(world: WorldConfig, theme: Theme) {
  for (const url of collectModelUrls(world, theme)) {
    if (done.has(url)) continue;
    done.add(url);
    useGLTF.preload(url);
  }
}
