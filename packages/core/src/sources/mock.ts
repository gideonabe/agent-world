import { createEnvelope, type AgentDescriptor, type AgentWorldEvent, type EventEnvelope } from '@agent-world/protocol';
import type { AgentEventSource } from './types';

export interface MockSourceOptions {
  /** Agents to simulate. Defaults to a generated crew. */
  agents?: AgentDescriptor[];
  /** Number of agents to generate when `agents` is omitted. */
  agentCount?: number;
  /** Task kinds the simulator may assign. */
  taskKinds?: string[];
  /** Idle time between tasks, ms. */
  idleMs?: [number, number];
  /** Task duration, ms. */
  taskMs?: [number, number];
  /** Probability a task fails. */
  failureRate?: number;
  /** Probability a task gets cancelled midway. */
  cancelRate?: number;
  /** Probability an idle agent receives a batch of 2-3 tasks (they queue up). */
  batchRate?: number;
  /** Multiplies all delays (2 = twice as slow). */
  timeScale?: number;
  seed?: number;
  projectId?: string;
}

const NAMES = [
  'Ada', 'Turing', 'Hopper', 'Lovelace', 'Babbage', 'Knuth', 'Ritchie', 'Hamilton', 'Shannon', 'Minsky',
  'Curie', 'Noether', 'Euler', 'Gauss', 'Tesla', 'Kepler', 'Darwin', 'Faraday', 'Bohr', 'Fermi',
];
const KIND_ROTATION = ['research', 'coding', 'writing', 'automation', 'coding', 'research', 'writing', 'general'];
const PALETTE = ['#ff7a59', '#4f9dff', '#ffc94d', '#7ed957', '#c084fc', '#ff6fae', '#38d0c9', '#f4f4f5'];

/** Example task titles per kind (exported so UIs can offer them). */
export const MOCK_TASKS: Record<string, string[]> = {
  research: ['Survey vector DB benchmarks', 'Summarize 12 papers on RAG', 'Compare pricing of 5 APIs', 'Analyze competitor launch', 'Gather user interview notes'],
  coding: ['Refactor auth middleware', 'Fix flaky payment test', 'Implement CSV export', 'Migrate to new SDK', 'Optimize image pipeline'],
  writing: ['Draft release notes', 'Write onboarding email', 'Edit API reference', 'Outline blog post', 'Translate landing page'],
  automation: ['Sync CRM contacts', 'Nightly data backup', 'Triage support inbox', 'Deploy staging build', 'Rotate API credentials'],
};
const PROGRESS_MSG: Record<string, string[]> = {
  research: ['Searching sources…', 'Reading documents…', 'Cross-checking facts…', 'Taking notes…'],
  coding: ['Reading codebase…', 'Writing code…', 'Running tests…', 'Fixing lint errors…'],
  writing: ['Outlining…', 'Drafting…', 'Polishing tone…', 'Proofreading…'],
  automation: ['Calling webhook…', 'Moving records…', 'Waiting on API…', 'Verifying results…'],
};
const ERRORS = ['Rate limit exceeded', 'Tool call timed out', 'Upstream API returned 500', 'Context window exceeded', 'Permission denied'];

/** Small deterministic PRNG so demos are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateAgents(count: number, seed = 7): AgentDescriptor[] {
  const rnd = mulberry32(seed);
  const names = NAMES.slice().sort(() => rnd() - 0.5);
  return Array.from({ length: count }, (_, i) => {
    const kind = KIND_ROTATION[i % KIND_ROTATION.length]!;
    return {
      id: `agent-${i + 1}`,
      name: `${names[i % names.length]}${i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''}`,
      kind,
      appearance: { color: PALETTE[i % PALETTE.length]! },
    };
  });
}

type Timer = ReturnType<typeof setTimeout>;

interface SimTask {
  id: string;
  kind: string;
  title: string;
  priority: number;
}

interface SimAgent {
  desc: AgentDescriptor;
  /** Pending tasks, highest priority first (mirrors the store's ordering). */
  backlog: SimTask[];
  current?: SimTask;
  /** idle: nothing running · running: executing `current` · between: short break before the next task */
  state: 'idle' | 'running' | 'between';
  /** Timers belonging to the current task (cleared on cancel). */
  taskTimers: Set<Timer>;
  autoScheduled: boolean;
}

/**
 * Simulates a fleet of agent runtimes. Emits only protocol events, exactly
 * like a real integration would: registrations, task batches (which queue
 * up), progress, completions, failures and cancellations.
 *
 * `assign()` / `cancel()` let a UI act as the orchestrator for simulated agents.
 */
export class MockEventSource implements AgentEventSource {
  readonly name = 'mock';
  private emitFn: ((env: EventEnvelope) => void) | null = null;
  private timers = new Set<Timer>();
  private rnd: () => number;
  private roster: AgentDescriptor[];
  private sims = new Map<string, SimAgent>();
  private opts: Required<Omit<MockSourceOptions, 'agents' | 'projectId'>> & { projectId?: string };
  private taskSeq = 0;
  paused = false;

  constructor(options: MockSourceOptions = {}) {
    this.opts = {
      agentCount: options.agentCount ?? 8,
      taskKinds: options.taskKinds ?? Object.keys(MOCK_TASKS),
      idleMs: options.idleMs ?? [3000, 9000],
      taskMs: options.taskMs ?? [10000, 22000],
      failureRate: options.failureRate ?? 0.12,
      cancelRate: options.cancelRate ?? 0.04,
      batchRate: options.batchRate ?? 0.22,
      timeScale: options.timeScale ?? 1,
      seed: options.seed ?? 42,
      projectId: options.projectId,
    };
    this.rnd = mulberry32(this.opts.seed);
    this.roster = options.agents ?? generateAgents(this.opts.agentCount, this.opts.seed);
  }

  start(emit: (env: EventEnvelope) => void) {
    this.emitFn = emit;
    this.sims.clear();
    this.roster.forEach((a, i) => this.later(400 + i * 650, () => this.register(a)));
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.emitFn = null;
  }

  setTimeScale(scale: number) {
    this.opts.timeScale = Math.max(0.1, scale);
  }

  /** Adds a new simulated agent at runtime. */
  spawn(descriptor?: Partial<AgentDescriptor>) {
    const n = this.roster.length;
    const generated = generateAgents(n + 1, this.opts.seed)[n]!;
    const agent: AgentDescriptor = { ...generated, id: `agent-${Date.now().toString(36)}`, ...descriptor };
    this.roster.push(agent);
    this.register(agent);
    return agent;
  }

  /** Removes a simulated agent. */
  remove(agentId: string) {
    const sim = this.sims.get(agentId);
    if (sim) this.clearTaskTimers(sim);
    this.sims.delete(agentId);
    this.roster = this.roster.filter((a) => a.id !== agentId);
    this.send({ type: 'agent.removed', agentId });
  }

  /** True when this source simulates the given agent. */
  owns(agentId: string) {
    return this.sims.has(agentId);
  }

  /** Orchestrator API: hand a task to a simulated agent. Returns the task id. */
  assign(agentId: string, kind: string, title: string, opts: { priority?: number; metadata?: Record<string, unknown> } = {}) {
    const sim = this.sims.get(agentId);
    if (!sim) return undefined;
    return this.enqueue(sim, kind, title, opts.priority ?? 0, opts.metadata);
  }

  /** Orchestrator API: cancel a running or queued task. */
  cancel(taskId: string, reason = 'Cancelled by operator') {
    for (const sim of this.sims.values()) {
      if (sim.current?.id === taskId) {
        this.clearTaskTimers(sim);
        this.send({ type: 'task.cancelled', taskId, reason });
        this.finishCurrent(sim, 1500);
        return true;
      }
      const i = sim.backlog.findIndex((t) => t.id === taskId);
      if (i >= 0) {
        sim.backlog.splice(i, 1);
        this.send({ type: 'task.cancelled', taskId, reason });
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------

  private register(desc: AgentDescriptor) {
    const sim: SimAgent = { desc, backlog: [], state: 'idle', taskTimers: new Set(), autoScheduled: false };
    this.sims.set(desc.id, sim);
    this.send({ type: 'agent.registered', agent: desc });
    this.scheduleAuto(sim, 1500);
  }

  private alive(sim: SimAgent) {
    return this.sims.get(sim.desc.id) === sim;
  }

  /** Spontaneous work: when idle, the agent receives 1-3 new tasks. */
  private scheduleAuto(sim: SimAgent, extra = 0) {
    if (sim.autoScheduled) return;
    sim.autoScheduled = true;
    this.later(extra + this.range(this.opts.idleMs), () => {
      sim.autoScheduled = false;
      if (!this.alive(sim) || sim.state !== 'idle') return;
      const n = this.rnd() < this.opts.batchRate ? 2 + (this.rnd() < 0.35 ? 1 : 0) : 1;
      for (let i = 0; i < n; i++) {
        const kind = this.pickKind(sim.desc);
        this.enqueue(sim, kind, this.pick(MOCK_TASKS[kind] ?? [`Run ${kind} job`]), 0);
      }
    });
  }

  private enqueue(sim: SimAgent, kind: string, title: string, priority: number, metadata?: Record<string, unknown>) {
    const id = `task-${++this.taskSeq}-${Math.floor(this.rnd() * 1e6).toString(36)}`;
    this.send({
      type: 'task.assigned',
      task: { id, agentId: sim.desc.id, kind, title, ...(priority ? { priority } : {}), ...(metadata ? { metadata } : {}) },
    });
    const task: SimTask = { id, kind, title, priority };
    const idx = sim.backlog.findIndex((t) => t.priority < priority);
    sim.backlog.splice(idx < 0 ? sim.backlog.length : idx, 0, task);
    if (sim.state === 'idle') this.executeNext(sim, 600);
    return id;
  }

  private executeNext(sim: SimAgent, delay: number) {
    if (!this.alive(sim)) return;
    const task = sim.backlog.shift();
    if (!task) {
      sim.state = 'idle';
      this.scheduleAuto(sim, 2500);
      return;
    }
    sim.state = 'running';
    sim.current = task;
    const at = (ms: number, fn: () => void) => this.later(ms, fn, sim.taskTimers);

    at(delay, () => this.send({ type: 'task.started', taskId: task.id }));
    const duration = this.range(this.opts.taskMs);
    const r = this.rnd();
    const outcome = r < this.opts.failureRate ? 'fail' : r < this.opts.failureRate + this.opts.cancelRate ? 'cancel' : 'complete';
    const stopAt = outcome === 'complete' ? 2 : 0.3 + this.rnd() * 0.6;
    const steps = Math.max(3, Math.round(duration / 1500));
    const msgs = PROGRESS_MSG[task.kind] ?? ['Working…'];

    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const when = delay + (duration * i) / steps;
      if (p >= stopAt) {
        at(when, () => {
          if (outcome === 'fail') this.send({ type: 'task.failed', taskId: task.id, error: this.pick(ERRORS) });
          else this.send({ type: 'task.cancelled', taskId: task.id, reason: 'Superseded by a newer request' });
          this.finishCurrent(sim, 3500);
        });
        return;
      }
      if (i === steps) {
        at(when, () => {
          this.send({ type: 'task.completed', taskId: task.id });
          this.finishCurrent(sim, 3200);
        });
      } else {
        at(when, () =>
          this.send({ type: 'task.progress', taskId: task.id, progress: p, message: msgs[Math.min(msgs.length - 1, Math.floor(p * msgs.length))] }),
        );
      }
    }
  }

  /** Short break (the robot celebrates / walks over) before the next task. */
  private finishCurrent(sim: SimAgent, gap: number) {
    sim.current = undefined;
    sim.state = 'between';
    this.later(gap, () => {
      sim.state = 'idle';
      this.executeNext(sim, 800);
    });
  }

  private clearTaskTimers(sim: SimAgent) {
    for (const t of sim.taskTimers) {
      clearTimeout(t);
      this.timers.delete(t);
    }
    sim.taskTimers.clear();
  }

  private pickKind(agent: AgentDescriptor) {
    const kinds = this.opts.taskKinds;
    if (kinds.includes(agent.kind) && this.rnd() < 0.8) return agent.kind;
    return this.pick(kinds);
  }

  private send(event: AgentWorldEvent) {
    this.emitFn?.(createEnvelope(event, this.opts.projectId, Date.now(), 'mock'));
  }

  /** setTimeout that respects pause + timeScale; optionally tracked in a bucket. */
  private later(ms: number, fn: () => void, bucket?: Set<Timer>) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      bucket?.delete(t);
      if (!this.emitFn) return;
      if (this.paused) return this.later(250, fn, bucket);
      fn();
    }, ms * this.opts.timeScale);
    this.timers.add(t);
    bucket?.add(t);
  }

  private range([a, b]: [number, number]) {
    return a + this.rnd() * (b - a);
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)]!;
  }
}
