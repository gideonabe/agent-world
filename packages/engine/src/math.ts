import type { StationDef, Vec2 } from '@agent-viz/protocol';

/** Rotates a station-local offset into world space (matches three.js Y rotation). */
export function stationToWorld(station: StationDef, local: Vec2): Vec2 {
  const r = station.rotation ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [station.position[0] + local[0] * c + local[1] * s, station.position[1] - local[0] * s + local[1] * c];
}

export interface SlotPose {
  position: Vec2;
  facing: number;
  entryNode: string;
}

/** World pose for a slot index; indices beyond the slot count form a queue in front of the station. */
export function slotPose(station: StationDef, index: number): SlotPose {
  const slot = station.slots[index];
  const r = station.rotation ?? 0;
  if (slot) {
    return {
      position: stationToWorld(station, slot.position),
      facing: r + slot.facing,
      entryNode: slot.entryNode ?? station.entryNode,
    };
  }
  const q = index - station.slots.length;
  const local: Vec2 = [-0.7 + (q % 3) * 0.7, 1.6 + Math.floor(q / 3) * 0.7];
  return { position: stationToWorld(station, local), facing: r + Math.PI, entryNode: station.entryNode };
}

/** Shortest signed angular difference b - a in [-PI, PI]. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function weightedPick<T>(items: [T, number][], rnd: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![0];
}

/** Smooth, seeded island shoreline radius multiplier for angle `a`. */
export function shoreNoise(a: number, seed: number) {
  const rnd = mulberry32(seed);
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const p3 = rnd() * 6.28;
  return 1 + 0.045 * Math.sin(a * 3 + p1) + 0.03 * Math.sin(a * 5 + p2) + 0.02 * Math.sin(a * 9 + p3);
}
