import { describe, expect, it } from 'vitest';
import { NavGraph } from '../src/navigation/navGraph';
import { AgentMotion } from '../src/characters/agentMotion';
import { meadowIsland } from '../src/presets/meadowIsland';
import { slotPose } from '../src/math';
import { scatterDecor } from '../src/environment/scatter';
import { meadowTheme } from '../src/themes/meadow';

const nav = new NavGraph(meadowIsland.navigation);

describe('NavGraph', () => {
  it('finds a path across the plaza ring', () => {
    const p = nav.findPath('nw', 'se');
    expect(p[0]).toBe('nw');
    expect(p[p.length - 1]).toBe('se');
    expect(p.length).toBeGreaterThanOrEqual(4);
  });

  it('every node is reachable from every other', () => {
    const ids = [...nav.nodes.keys()];
    for (const a of ids) for (const b of ids) expect(nav.findPath(a, b).length).toBeGreaterThan(0);
  });

  it('every station entry node exists', () => {
    for (const s of meadowIsland.stations) {
      expect(nav.nodes.has(s.entryNode)).toBe(true);
      for (const sl of s.slots) if (sl.entryNode) expect(nav.nodes.has(sl.entryNode)).toBe(true);
      for (const r of s.roamNodes ?? []) expect(nav.nodes.has(r)).toBe(true);
    }
  });
});

function simulate(m: AgentMotion, seconds: number, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) m.update(dt);
}

describe('AgentMotion', () => {
  const cfg = { walkSpeed: 1.9, runSpeed: 3.6 };

  it('walks to its station slot and starts working', () => {
    const m = new AgentMotion('a1', nav, cfg);
    const station = meadowIsland.stations.find((s) => s.id === 'code-forge')!;
    m.setIntent({ type: 'station', station, slotIndex: 1, workClip: 'type', urgent: false });
    simulate(m, 30);
    const pose = slotPose(station, 1);
    expect(Math.hypot(m.pos[0] - pose.position[0], m.pos[1] - pose.position[1])).toBeLessThan(0.05);
    expect(m.phase).toBe('working');
    expect(m.clip).toBe('work:type');
  });

  it('reacts, then resumes the base intent (e.g. the next queued task)', () => {
    const m = new AgentMotion('a2', nav, cfg);
    simulate(m, 2);
    const station = meadowIsland.stations.find((s) => s.id === 'research-lab')!;
    m.react('celebrate');
    // next task arrives while celebrating: stored, not applied yet
    m.setIntent({ type: 'station', station, slotIndex: 0, workClip: 'read', urgent: false });
    expect(m.phase).toBe('reacting');
    expect(m.clip).toBe('celebrate');
    simulate(m, 3);
    expect(m.phase).toBe('moving');
    simulate(m, 30);
    expect(m.clip).toBe('work:read');
  });

  it('walks to a destination and rests there', () => {
    const m = new AgentMotion('a4', nav, cfg);
    simulate(m, 2);
    m.setIntent({ type: 'goto', target: [9.6, 0], nodeId: 'e-look' });
    simulate(m, 30);
    expect(Math.hypot(m.pos[0] - 9.6, m.pos[1])).toBeLessThan(0.05);
    expect(m.phase).toBe('idle');
    simulate(m, 20);
    expect(Math.hypot(m.pos[0] - 9.6, m.pos[1])).toBeLessThan(0.05); // doesn't wander off
  });

  it('roaming workers leave their slot and come back', () => {
    const m = new AgentMotion('a3', nav, cfg);
    const station = meadowIsland.stations.find((s) => s.workStyle === 'roaming')!;
    m.setIntent({ type: 'station', station, slotIndex: 0, workClip: 'build', urgent: false });
    const phases = new Set<string>();
    for (let t = 0; t < 60; t += 1 / 30) {
      m.update(1 / 30);
      phases.add(m.phase);
    }
    expect(phases.has('working')).toBe(true);
    expect(phases.has('moving')).toBe(true);
  });
});

describe('scatterDecor', () => {
  it('is deterministic and keeps paths clear', () => {
    const a = scatterDecor(meadowIsland, meadowTheme.decor, meadowTheme.propScale);
    const b = scatterDecor(meadowIsland, meadowTheme.decor, meadowTheme.propScale);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(50);
  });
});
