import { describe, expect, it } from 'vitest';
import { pickStation } from '@agent-viz/core';
import { allWorlds } from '../src/presets';
import { getWorldStyle } from '../src/worlds';
import { slotPose } from '../src/math';

/** Kinds that producers (the SDK simulator, the Claude Code bridge) send. Every world must route all of them. */
const STANDARD_KINDS = ['research', 'coding', 'writing', 'automation'];

describe.each(allWorlds.map((w) => [w.id, w] as const))('world %s', (_id, world) => {
  const nodes = new Map(world.navigation.nodes.map((n) => [n.id, n]));
  const R = world.island.radius;
  const inside = ([x, z]: [number, number], margin = 0) =>
    world.ground?.shape === 'square' ? Math.abs(x) <= R - margin && Math.abs(z) <= R - margin : Math.hypot(x, z) <= R - margin;

  it('has a dedicated station for every standard kind and a "*" home station', () => {
    for (const kind of STANDARD_KINDS) expect(pickStation(world, kind, {})?.accepts, kind).toContain(kind);
    const home = world.stations.find((s) => s.id === world.homeStationId);
    expect(home?.accepts).toContain('*');
    expect(pickStation(world, 'thinking', {})?.id).toBe(world.homeStationId);
  });

  it('has unique ids and every referenced nav node exists', () => {
    expect(new Set(world.stations.map((s) => s.id)).size).toBe(world.stations.length);
    expect(nodes.size).toBe(world.navigation.nodes.length);
    for (const [a, b] of world.navigation.edges) expect(nodes.has(a) && nodes.has(b), `${a}-${b}`).toBe(true);
    for (const s of world.stations) {
      expect(nodes.has(s.entryNode), `${s.id} entry`).toBe(true);
      for (const slot of s.slots) if (slot.entryNode) expect(nodes.has(slot.entryNode), `${s.id} slot entry`).toBe(true);
      for (const n of s.roamNodes ?? []) expect(nodes.has(n), `${s.id} roam ${n}`).toBe(true);
    }
  });

  it('has a connected walkway graph with places to wander', () => {
    const adj = new Map<string, string[]>();
    for (const [a, b] of world.navigation.edges) {
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }
    const seen = new Set<string>();
    const stack = [world.navigation.nodes[0]!.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(adj.get(id) ?? []));
    }
    expect(seen.size).toBe(nodes.size);
    expect(world.navigation.nodes.some((n) => n.tags?.includes('wander'))).toBe(true);
  });

  it('keeps nodes, stations, work slots and props on the ground', () => {
    for (const n of world.navigation.nodes) expect(inside(n.position, 0.5), n.id).toBe(true);
    for (const s of world.stations) {
      expect(inside(s.position, 1), s.id).toBe(true);
      s.slots.forEach((_, i) => {
        expect(inside(slotPose(s, i).position, 0.3), `${s.id} slot ${i}`).toBe(true);
      });
    }
    for (const p of world.props ?? []) expect(inside(p.position, -0.2), p.model).toBe(true);
  });

  it('has a look (theme + scene)', () => {
    const style = getWorldStyle(world.id);
    expect(style.theme).toBeTruthy();
    expect(style.Scene).toBeTypeOf('function');
    if (world.id !== 'meadow-island') expect(style.theme.id).not.toBe('meadow');
  });
});
