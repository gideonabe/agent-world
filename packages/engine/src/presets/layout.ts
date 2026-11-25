import type { NavGraphDef, PropPlacement, Vec2 } from '@agent-viz/protocol';

/**
 * Small helpers shared by the built-in worlds. Plain data only (no React or three), because the server
 * bundles the presets.
 */

/** Rotation that turns a station at (x, z) to face the centre of the world. */
export const facingCenter = (x: number, z: number) => Math.atan2(-x, -z);

/** Faces the back of a station (toward its furniture). */
export const BACK = Math.PI;

/**
 * The standard layout most worlds use: a ring of four walkway nodes around a central hub, four corner
 * entry nodes (nw, ne, sw, se) for the corner stations, and four "look" nodes near the edges where idle
 * agents like to stroll.
 */
export function ringNav(inner = 3.6, corner = 4.4, look = 9.6): NavGraphDef {
  return {
    nodes: [
      { id: 'n', position: [0, -inner], tags: ['wander'] },
      { id: 'e', position: [inner, 0], tags: ['wander'] },
      { id: 's', position: [0, inner], tags: ['wander'] },
      { id: 'w', position: [-inner, 0], tags: ['wander'] },
      { id: 'nw', position: [-corner, -corner] },
      { id: 'ne', position: [corner, -corner] },
      { id: 'sw', position: [-corner, corner] },
      { id: 'se', position: [corner, corner] },
      { id: 'n-look', position: [0, -look], tags: ['wander'] },
      { id: 'e-look', position: [look, 0], tags: ['wander'] },
      { id: 's-look', position: [0, look], tags: ['wander'] },
      { id: 'w-look', position: [-look, 0], tags: ['wander'] },
    ],
    edges: [
      ['n', 'e'], ['e', 's'], ['s', 'w'], ['w', 'n'],
      ['n', 'nw'], ['w', 'nw'], ['n', 'ne'], ['e', 'ne'],
      ['s', 'sw'], ['w', 'sw'], ['s', 'se'], ['e', 'se'],
      ['n', 'n-look'], ['e', 'e-look'], ['s', 's-look'], ['w', 'w-look'],
    ],
  };
}

/** Four slots around a hub (one per side), each approached from its own ring node. */
export function hubSlots(r = 1.25) {
  return [
    { position: [0, r] as Vec2, facing: BACK, entryNode: 's' },
    { position: [r, 0] as Vec2, facing: -Math.PI / 2, entryNode: 'e' },
    { position: [0, -r] as Vec2, facing: 0, entryNode: 'n' },
    { position: [-r, 0] as Vec2, facing: Math.PI / 2, entryNode: 'w' },
  ];
}

/**
 * A run of wall pieces along the back (north, z = -edge) and left (west, x = -edge) sides of a square
 * world. Only the two far sides get walls, so the camera can always see inside (a cut-away diorama).
 * `pattern` picks the model for each segment in turn.
 */
export function backWalls(edge: number, pattern: string[], segment = 2.2, scale = 1): PropPlacement[] {
  const out: PropPlacement[] = [];
  const n = Math.round((edge * 2) / segment);
  for (let i = 0; i < n; i++) {
    const t = -edge + segment * (i + 0.5);
    const model = pattern[i % pattern.length]!;
    out.push({ model, position: [t, -edge + 0.06], scale });
    out.push({ model, position: [-edge + 0.06, t], rotation: Math.PI / 2, scale });
  }
  return out;
}
