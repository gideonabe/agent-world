import type { StationDef, WorldConfig } from '@agent-world/protocol';

/**
 * Picks the best station for a task kind:
 *  1. explicit stationId (if it exists)
 *  2. stations that accept the kind exactly, least loaded first
 *  3. wildcard stations ("*"), least loaded first
 *  4. home station
 */
export function pickStation(
  world: WorldConfig,
  taskKind: string,
  occupancy: Record<string, (string | null)[]>,
  explicitStationId?: string,
): StationDef | undefined {
  if (explicitStationId) {
    const s = world.stations.find((st) => st.id === explicitStationId);
    if (s) return s;
  }
  const load = (s: StationDef) => {
    const occ = occupancy[s.id] ?? [];
    const used = occ.filter((a) => a !== null).length;
    return used / Math.max(1, s.slots.length);
  };
  const byLoad = (a: StationDef, b: StationDef) => load(a) - load(b);
  const exact = world.stations.filter((s) => s.accepts.includes(taskKind)).sort(byLoad);
  if (exact[0]) return exact[0];
  const wildcard = world.stations.filter((s) => s.accepts.includes('*')).sort(byLoad);
  if (wildcard[0]) return wildcard[0];
  return world.stations.find((s) => s.id === world.homeStationId);
}

/** Returns a new slot array with the agent placed in the first free slot. */
export function allocateSlot(slots: (string | null)[], agentId: string): { slots: (string | null)[]; index: number } {
  const next = slots.slice();
  const existing = next.indexOf(agentId);
  if (existing >= 0) return { slots: next, index: existing };
  const free = next.indexOf(null);
  if (free >= 0) {
    next[free] = agentId;
    return { slots: next, index: free };
  }
  next.push(agentId);
  return { slots: next, index: next.length - 1 };
}

export function releaseSlot(slots: (string | null)[], agentId: string): (string | null)[] {
  const next = slots.map((a) => (a === agentId ? null : a));
  // trim trailing free overflow entries so queues shrink
  while (next.length > 0 && next[next.length - 1] === null) next.pop();
  return next;
}
