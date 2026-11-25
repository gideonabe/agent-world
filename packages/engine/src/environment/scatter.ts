import type { Vec2, WorldConfig } from '@agent-viz/protocol';
import { NavGraph, distToSegment } from '../navigation/navGraph';
import { mulberry32, shoreNoise, weightedPick } from '../math';
import type { DecorDef } from '../themes/theme';

export interface DecorItem {
  model: string;
  position: Vec2;
  rotation: number;
  scale: number;
  category: 'tree' | 'rock' | 'plant' | 'shore';
}

/**
 * Deterministic decoration placement: rejection-samples points on the island
 * that stay clear of paths, stations and hand-placed props.
 */
export function scatterDecor(world: WorldConfig, decor: DecorDef, propScale: number): DecorItem[] {
  const density = world.island.decorDensity ?? 1;
  if (density <= 0) return [];
  const rnd = mulberry32(world.island.seed);
  const nav = new NavGraph(world.navigation);
  const edges = nav.edges;
  const R = world.island.radius;
  const placed: { p: Vec2; r: number }[] = [];
  const out: DecorItem[] = [];

  const blockers: { p: Vec2; r: number }[] = [
    ...world.stations.map((s) => ({ p: s.position, r: (s.radius ?? 2.5) + 0.4 })),
    ...(world.props ?? []).map((pr) => ({ p: pr.position, r: 1.1 })),
  ];

  const clear = (p: Vec2, r: number, pathGap: number) => {
    for (const [a, b] of edges) if (distToSegment(p, a.position, b.position) < pathGap + r) return false;
    for (const n of nav.nodes.values()) if (Math.hypot(p[0] - n.position[0], p[1] - n.position[1]) < pathGap + r + 0.2) return false;
    for (const b of blockers) if (Math.hypot(p[0] - b.p[0], p[1] - b.p[1]) < b.r + r) return false;
    for (const q of placed) if (Math.hypot(p[0] - q.p[0], p[1] - q.p[1]) < q.r + r) return false;
    return true;
  };

  const inside = (p: Vec2, margin: number) => {
    const a = Math.atan2(p[1], p[0]);
    return Math.hypot(p[0], p[1]) < R * shoreNoise(a, world.island.seed) - margin;
  };

  const place = (
    category: DecorItem['category'],
    pool: [string, number][],
    count: number,
    radius: number,
    pathGap: number,
    scale: [number, number],
    sample: () => Vec2,
    margin: number,
  ) => {
    let made = 0;
    for (let tries = 0; tries < count * 30 && made < count; tries++) {
      const p = sample();
      if (!inside(p, margin) || !clear(p, radius, pathGap)) continue;
      placed.push({ p, r: radius });
      out.push({
        model: weightedPick(pool, rnd),
        position: p,
        rotation: rnd() * Math.PI * 2,
        scale: propScale * (scale[0] + rnd() * (scale[1] - scale[0])),
        category,
      });
      made++;
    }
  };

  const disk = (): Vec2 => {
    const r = R * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const rim = (): Vec2 => {
    const a = rnd() * Math.PI * 2;
    const r = R * shoreNoise(a, world.island.seed) * (0.84 + rnd() * 0.1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  place('shore', decor.shoreline, Math.round(9 * density), 0.9, 0.9, [0.85, 1.15], rim, 0.4);
  place('tree', decor.trees, Math.round(22 * density), 0.85, 1.0, [0.7, 1.05], disk, 0.8);
  place('rock', decor.rocks, Math.round(12 * density), 0.45, 0.7, [0.7, 1.2], disk, 0.6);
  place('plant', decor.plants, Math.round(80 * density), 0.25, 0.65, [0.8, 1.3], disk, 0.5);
  return out;
}
