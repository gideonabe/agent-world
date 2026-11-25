import type { StationDef, Vec2 } from '@agent-viz/protocol';
import type { NavGraph } from '../navigation/navGraph';
import { angleDelta, hashString, mulberry32, slotPose } from '../math';

/** What the agent should be doing, derived from its logical state. */
export type MotionIntent =
  | { type: 'wander' }
  | { type: 'station'; station: StationDef; slotIndex: number; workClip: string; urgent: boolean }
  | { type: 'workHere'; workClip: string }
  /** Walk to a point and rest there (idle agents with a destination). */
  | { type: 'goto'; target: Vec2; nodeId?: string; facing?: number }
  | { type: 'hold' };

export type Reaction = 'celebrate' | 'fail' | 'cancel';

/** Logical animation keys; the Robot maps them to theme clip names. */
export type ClipKey = 'idle' | 'walk' | 'run' | 'wave' | 'celebrate' | 'fail' | 'cancel' | `work:${string}`;

export type MotionPhase = 'spawn' | 'idle' | 'moving' | 'working' | 'reacting';

export interface MotionConfig {
  walkSpeed: number;
  runSpeed: number;
  /** Distance under which agents push each other apart. */
  personalSpace?: number;
}

const SPAWN_TIME = 1.8;
const REACT_TIME = 2.8;

/**
 * Per-agent locomotion + behaviour state machine. Plain TypeScript (no
 * three.js) so it is testable and cheap; the Robot component reads it each frame.
 */
export class AgentMotion {
  pos: Vec2;
  heading: number;
  targetHeading: number;
  speed = 0;
  path: Vec2[] = [];
  phase: MotionPhase = 'spawn';
  clip: ClipKey = 'wave';
  /** Seconds since spawn (used for the pop-in animation). */
  age = 0;
  private timer = 0;
  private mode: 'walk' | 'run' = 'walk';
  private onArrive: (() => void) | null = null;
  private intent: MotionIntent = { type: 'wander' };
  private rnd: () => number;
  private laneOffset: Vec2;
  private atRoamPoint = false;

  constructor(
    readonly id: string,
    private nav: NavGraph,
    private cfg: MotionConfig,
    start?: Vec2,
  ) {
    this.rnd = mulberry32(hashString(id));
    const wander = nav.nodesWithTag('wander');
    const spawnNode = wander[Math.floor(this.rnd() * wander.length)] ?? [...nav.nodes.values()][0];
    const base: Vec2 = start ?? spawnNode?.position ?? [0, 0];
    this.pos = [base[0] + (this.rnd() - 0.5) * 0.6, base[1] + (this.rnd() - 0.5) * 0.6];
    this.heading = this.targetHeading = this.rnd() * Math.PI * 2;
    const a = this.rnd() * Math.PI * 2;
    const r = 0.12 + this.rnd() * 0.2;
    this.laneOffset = [Math.cos(a) * r, Math.sin(a) * r];
  }

  get currentIntent() {
    return this.intent;
  }

  /**
   * Sets the base behaviour. While spawning or reacting the new intent is
   * stored and applied once the one-shot animation finishes.
   */
  setIntent(intent: MotionIntent) {
    // Repeated "wander" shouldn't interrupt an ongoing stroll.
    if (intent.type === 'wander' && this.intent.type === 'wander') return;
    this.intent = intent;
    if (this.phase !== 'spawn' && this.phase !== 'reacting') this.applyIntent();
  }

  /** One-shot reaction (task finished/failed/cancelled), then resume the base intent. */
  react(reaction: Reaction) {
    if (this.phase === 'spawn') return;
    this.stop(reaction);
    this.phase = 'reacting';
    this.timer = REACT_TIME;
  }

  update(dt: number, others?: Iterable<AgentMotion>) {
    this.age += dt;
    this.timer -= dt;

    switch (this.phase) {
      case 'spawn':
        if (this.age >= SPAWN_TIME) this.applyIntent();
        break;
      case 'idle':
        if (this.intent.type === 'wander' && this.timer <= 0) this.wanderStep();
        break;
      case 'moving':
        this.followPath(dt);
        break;
      case 'working':
        if (this.intent.type === 'station' && this.intent.station.workStyle === 'roaming' && this.timer <= 0) this.roamStep();
        break;
      case 'reacting':
        if (this.timer <= 0) this.applyIntent();
        break;
    }

    if (others && (this.phase === 'moving' || this.phase === 'idle')) this.separate(dt, others);

    const k = Math.min(1, dt * 8);
    this.heading += angleDelta(this.heading, this.targetHeading) * k;
  }

  private applyIntent() {
    const it = this.intent;
    this.onArrive = null;
    switch (it.type) {
      case 'wander':
        this.stop('idle');
        this.timer = 0.8 + this.rnd() * 3;
        break;
      case 'hold':
        this.stop('idle');
        this.timer = Infinity;
        break;
      case 'workHere':
        this.stop(`work:${it.workClip}`);
        this.phase = 'working';
        break;
      case 'goto': {
        const facing = it.facing;
        this.goTo(it.target, it.nodeId, 'walk', () => {
          this.stop('idle');
          this.timer = Infinity;
          if (facing !== undefined) this.targetHeading = facing;
        });
        break;
      }
      case 'station': {
        const pose = slotPose(it.station, it.slotIndex);
        this.atRoamPoint = false;
        this.goTo(pose.position, pose.entryNode, it.urgent ? 'run' : 'walk', () => {
          this.stop(`work:${it.workClip}`);
          this.phase = 'working';
          this.targetHeading = pose.facing;
          this.timer = 3 + this.rnd() * 3;
        });
        break;
      }
    }
  }

  private wanderStep() {
    const nodes = this.nav.nodesWithTag('wander');
    if (!nodes.length) return;
    const node = nodes[Math.floor(this.rnd() * nodes.length)]!;
    const target: Vec2 = [node.position[0] + (this.rnd() - 0.5) * 0.7, node.position[1] + (this.rnd() - 0.5) * 0.7];
    this.goTo(target, node.id, 'walk', () => {
      this.stop('idle');
      this.timer = 2 + this.rnd() * 6;
      this.targetHeading = this.rnd() * Math.PI * 2;
    });
  }

  /** Roaming workers shuttle between the station and its roam nodes. */
  private roamStep() {
    const it = this.intent;
    if (it.type !== 'station') return;
    if (this.atRoamPoint) {
      this.applyIntent(); // head back to the slot
      return;
    }
    const ids = it.station.roamNodes ?? [];
    const node = this.nav.nodes.get(ids[Math.floor(this.rnd() * ids.length)] ?? '');
    if (!node) return;
    this.atRoamPoint = true;
    this.goTo(node.position, node.id, 'walk', () => {
      this.stop(`work:${it.workClip}`);
      this.phase = 'working';
      this.timer = 1.8 + this.rnd() * 2;
      this.targetHeading = this.rnd() * Math.PI * 2;
    });
  }

  private goTo(target: Vec2, nodeId: string | undefined, mode: 'walk' | 'run', onArrive: () => void) {
    const route = this.nav.route(this.pos, target, nodeId);
    // offset intermediate waypoints so agents don't walk in single file
    this.path = route.map((p, i) => (i < route.length - 1 ? [p[0] + this.laneOffset[0], p[1] + this.laneOffset[1]] : p));
    this.mode = mode;
    this.onArrive = onArrive;
    this.phase = 'moving';
    this.clip = mode;
    if (!this.path.length) this.arrive();
  }

  private followPath(dt: number) {
    const target = this.path[0];
    if (!target) return this.arrive();
    const dx = target[0] - this.pos[0];
    const dz = target[1] - this.pos[1];
    const d = Math.hypot(dx, dz);
    const final = this.path.length === 1;
    let desired = this.mode === 'run' ? this.cfg.runSpeed : this.cfg.walkSpeed;
    if (final) desired *= Math.min(1, Math.max(0.35, d / 0.8));
    this.speed += (desired - this.speed) * Math.min(1, dt * 5);
    const step = this.speed * dt;
    if (d <= Math.max(step, final ? 0.03 : 0.4)) {
      if (final) this.pos = [target[0], target[1]];
      this.path.shift();
      if (!this.path.length) this.arrive();
      return;
    }
    this.pos = [this.pos[0] + (dx / d) * step, this.pos[1] + (dz / d) * step];
    this.targetHeading = Math.atan2(dx, dz);
    this.clip = this.mode;
  }

  private arrive() {
    this.path = [];
    this.speed = 0;
    const cb = this.onArrive;
    this.onArrive = null;
    if (cb) cb();
    else this.stop('idle');
  }

  private stop(clip: ClipKey) {
    this.path = [];
    this.speed = 0;
    this.clip = clip;
    this.phase = 'idle';
  }

  private separate(dt: number, others: Iterable<AgentMotion>) {
    const space = this.cfg.personalSpace ?? 0.55;
    for (const o of others) {
      if (o === this) continue;
      const dx = this.pos[0] - o.pos[0];
      const dz = this.pos[1] - o.pos[1];
      const d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < space) {
        const push = ((space - d) / space) * dt * 1.6;
        this.pos = [this.pos[0] + (dx / d) * push, this.pos[1] + (dz / d) * push];
      }
    }
  }
}
