import * as THREE from 'three';

export interface BurstSpec {
  count: number;
  colors: string[];
  /** Initial speed range. */
  speed: [number, number];
  /** 0 = sideways spray, 1 = straight up. */
  up: number;
  life: [number, number];
  size: [number, number];
  gravity: number;
  /** Velocity damping per second (0..1). */
  drag?: number;
  /** Particles bounce/settle on the ground. */
  ground?: boolean;
  spin?: number;
}

/**
 * Fixed-size particle pool rendered as ONE InstancedMesh. Spawning never
 * allocates; the oldest particles are recycled when the pool is full.
 */
export class ParticlePool {
  readonly max: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly rot: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  readonly gravity: Float32Array;
  readonly drag: Float32Array;
  readonly spin: Float32Array;
  readonly ground: Uint8Array;
  readonly colors: THREE.Color[];
  private cursor = 0;
  /** True when any particle changed since the last sync. */
  dirtyColors = false;
  alive = 0;

  constructor(max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.ground = new Uint8Array(max);
    this.colors = Array.from({ length: max }, () => new THREE.Color());
  }

  burst(origin: [number, number, number], spec: BurstSpec, rnd: () => number = Math.random) {
    for (let n = 0; n < spec.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = rnd() * Math.PI * 2;
      const tilt = spec.up + (1 - spec.up) * rnd() * 0.6;
      const sp = spec.speed[0] + rnd() * (spec.speed[1] - spec.speed[0]);
      const horiz = Math.sqrt(Math.max(0, 1 - tilt * tilt));
      this.pos.set([origin[0] + (rnd() - 0.5) * 0.2, origin[1] + (rnd() - 0.5) * 0.2, origin[2] + (rnd() - 0.5) * 0.2], i * 3);
      this.vel.set([Math.cos(a) * horiz * sp, tilt * sp, Math.sin(a) * horiz * sp], i * 3);
      this.rot.set([rnd() * 6, rnd() * 6, rnd() * 6], i * 3);
      const l = spec.life[0] + rnd() * (spec.life[1] - spec.life[0]);
      if (this.life[i]! <= 0) this.alive++;
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = spec.size[0] + rnd() * (spec.size[1] - spec.size[0]);
      this.gravity[i] = spec.gravity;
      this.drag[i] = spec.drag ?? 0;
      this.spin[i] = (spec.spin ?? 6) * (rnd() - 0.5);
      this.ground[i] = spec.ground ? 1 : 0;
      this.colors[i]!.set(spec.colors[Math.floor(rnd() * spec.colors.length)]!);
    }
    this.dirtyColors = true;
  }

  /** Advances the simulation; returns true if any particle is alive. */
  step(dt: number): boolean {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) continue;
      alive++;
      const j = i * 3;
      const damp = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[j]! *= damp;
      this.vel[j + 2]! *= damp;
      this.vel[j + 1] = this.vel[j + 1]! * damp - this.gravity[i]! * dt;
      this.pos[j]! += this.vel[j]! * dt;
      this.pos[j + 1]! += this.vel[j + 1]! * dt;
      this.pos[j + 2]! += this.vel[j + 2]! * dt;
      if (this.ground[i] && this.pos[j + 1]! < 0.05) {
        this.pos[j + 1] = 0.05;
        this.vel[j + 1] = -this.vel[j + 1]! * 0.25;
        this.vel[j]! *= 0.5;
        this.vel[j + 2]! *= 0.5;
        this.spin[i]! *= 0.5;
      }
      const s = this.spin[i]! * dt;
      this.rot[j]! += s;
      this.rot[j + 1]! += s * 0.7;
    }
    this.alive = alive;
    return alive > 0;
  }

  /** Writes instance matrices (dead particles collapse to scale 0). */
  writeTo(mesh: THREE.InstancedMesh, tmp: THREE.Object3D) {
    for (let i = 0; i < this.max; i++) {
      const j = i * 3;
      const l = this.life[i]!;
      if (l <= 0) {
        tmp.scale.setScalar(0);
      } else {
        const t = l / this.maxLife[i]!;
        // shrink out over the last 30% of life
        tmp.scale.setScalar(this.size[i]! * Math.min(1, t / 0.3));
        tmp.position.set(this.pos[j]!, this.pos[j + 1]!, this.pos[j + 2]!);
        tmp.rotation.set(this.rot[j]!, this.rot[j + 1]!, this.rot[j + 2]!);
      }
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      if (this.dirtyColors) mesh.setColorAt(i, this.colors[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.dirtyColors = false;
  }
}

/** Preset bursts tuned for the meadow scale (robot ≈ 1.35 units). */
export const BURSTS = {
  confetti: (colors: string[]): BurstSpec => ({
    count: 46,
    colors,
    speed: [3, 5.5],
    up: 0.75,
    life: [1.6, 2.6],
    size: [0.06, 0.11],
    gravity: 7,
    drag: 1.2,
    ground: true,
    spin: 14,
  }),
  sparks: (): BurstSpec => ({
    count: 30,
    colors: ['#ff4d4d', '#ff8a3d', '#ffd166'],
    speed: [2.5, 4.5],
    up: 0.45,
    life: [0.5, 0.9],
    size: [0.04, 0.07],
    gravity: 9,
    drag: 0.6,
    ground: true,
    spin: 20,
  }),
  smoke: (): BurstSpec => ({
    count: 10,
    colors: ['#4b5563', '#6b7280', '#9ca3af'],
    speed: [0.3, 0.8],
    up: 1,
    life: [1.2, 1.8],
    size: [0.14, 0.24],
    gravity: -0.6,
    drag: 1.5,
    spin: 2,
  }),
  poof: (scale = 1): BurstSpec => ({
    count: Math.round(18 * scale),
    colors: ['#ffffff', '#e5e7eb', '#cbd5e1'],
    speed: [1, 2.2 * scale],
    up: 0.3,
    life: [0.6, 1.1],
    size: [0.12 * scale, 0.22 * scale],
    gravity: -0.8,
    drag: 3,
    spin: 3,
  }),
  sparkle: (color: string): BurstSpec => ({
    count: 18,
    colors: [color, '#ffffff', '#fde68a'],
    speed: [1.2, 2.6],
    up: 0.6,
    life: [0.7, 1.2],
    size: [0.05, 0.09],
    gravity: 1.5,
    drag: 2,
    spin: 10,
  }),
};
