import { describe, expect, it } from 'vitest';
import { BURSTS, ParticlePool } from '../src/effects/particles';

describe('ParticlePool', () => {
  it('spawns, simulates and expires particles without growing', () => {
    const pool = new ParticlePool(50);
    pool.burst([0, 1, 0], BURSTS.confetti(['#fff']));
    expect(pool.alive).toBe(46);
    pool.burst([0, 1, 0], BURSTS.sparks()); // overflows: recycles oldest
    expect(pool.alive).toBeLessThanOrEqual(50);
    let t = 0;
    while (pool.step(1 / 30) && t < 10) t += 1 / 30;
    expect(pool.alive).toBe(0);
    expect(t).toBeLessThan(3);
  });

  it('ground-colliding particles never sink below the ground', () => {
    const pool = new ParticlePool(60);
    pool.burst([0, 1, 0], BURSTS.confetti(['#fff']));
    let minY = Infinity;
    for (let i = 0; i < 60; i++) {
      pool.step(1 / 30);
      for (let p = 0; p < pool.max; p++) if (pool.life[p]! > 0) minY = Math.min(minY, pool.pos[p * 3 + 1]!);
    }
    expect(minY).toBeGreaterThanOrEqual(0.05);
  });
});
