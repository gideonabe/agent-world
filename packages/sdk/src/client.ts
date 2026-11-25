import type {
  AgentAppearance,
  AgentDestination,
  AgentStatus,
  AgentWorldEvent,
  TaskInput,
} from '@agent-world/protocol';

export interface AgentWorldClientOptions {
  /** Server base URL, e.g. http://127.0.0.1:8787 */
  url: string;
  /** Project id (default "default"). */
  project?: string;
  /** Write key for the project (required when the server runs with --auth). */
  apiKey?: string;
  /** Coalesce events sent within this window into one request (ms). */
  batchMs?: number;
  /** Max events per request. */
  maxBatch?: number;
  /** Max events kept while the server is unreachable; oldest are dropped beyond this. */
  maxQueue?: number;
  /** Retry backoff bounds (ms). */
  minRetryMs?: number;
  maxRetryMs?: number;
  /** Called for failed or rejected sends (never throws into your code). */
  onError?: (error: AgentWorldError) => void;
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
}

export class AgentWorldError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when the events were dropped (not retried). */
    readonly dropped = false,
  ) {
    super(message);
  }
}

export interface AgentInit {
  id?: string;
  name: string;
  kind: string;
  description?: string;
  appearance?: AgentAppearance;
  metadata?: Record<string, unknown>;
}

export interface TaskInit {
  id?: string;
  /** Picks the station; defaults to the agent's kind. */
  kind?: string;
  priority?: number;
  stationId?: string;
  metadata?: Record<string, unknown>;
}

const rid = (prefix: string) => {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${r.replace(/-/g, '').slice(0, 16)}`;
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) ?? 'Unknown error');

/**
 * Sends agent activity to an Agent World server.
 *
 * - Fire-and-forget: methods never throw and never block your agent's work.
 * - Events are batched, sent in order, and retried with backoff while the
 *   server is unreachable (bounded queue). Invalid/forbidden batches are
 *   dropped and reported via `onError`.
 * - Call `await client.close()` before your process exits.
 */
export class AgentWorldClient {
  private queue: AgentWorldEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | null = null;
  private attempt = 0;
  private closed = false;
  private waiters: (() => void)[] = [];
  private readonly o: Required<Omit<AgentWorldClientOptions, 'apiKey' | 'onError' | 'fetch'>> & Pick<AgentWorldClientOptions, 'apiKey' | 'onError' | 'fetch'>;
  readonly stats = { sent: 0, retried: 0, dropped: 0 };

  constructor(options: AgentWorldClientOptions) {
    this.o = { project: 'default', batchMs: 50, maxBatch: 200, maxQueue: 5000, minRetryMs: 500, maxRetryMs: 30000, ...options };
    this.o.url = this.o.url.replace(/\/+$/, '');
  }

  get endpoint() {
    return `${this.o.url}/v1/projects/${encodeURIComponent(this.o.project)}/events`;
  }

  /** Events waiting to be delivered. */
  get pending() {
    return this.queue.length;
  }

  /** Low-level: queue raw protocol events. */
  send(events: AgentWorldEvent | AgentWorldEvent[]) {
    if (this.closed) return;
    this.queue.push(...(Array.isArray(events) ? events : [events]));
    if (this.queue.length > this.o.maxQueue) {
      const drop = this.queue.length - this.o.maxQueue;
      this.queue.splice(0, drop);
      this.stats.dropped += drop;
      this.report(new AgentWorldError(`Queue full: dropped ${drop} oldest events`, undefined, true));
    }
    this.schedule(this.o.batchMs);
  }

  /** Creates (registers) an agent. Calling again with the same id updates it. */
  agent(init: AgentInit): AgentHandle {
    const id = init.id ?? rid('agent');
    this.send({ type: 'agent.registered', agent: { ...init, id } });
    return new AgentHandle(this, id, init.kind);
  }

  /** Resolves when everything queued so far has been delivered (or dropped). */
  flush(): Promise<void> {
    if (!this.queue.length && !this.inflight) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.schedule(0);
    });
  }

  /** Flushes, then stops accepting events. */
  async close(timeoutMs = 5000) {
    await Promise.race([this.flush(), new Promise((r) => setTimeout(r, timeoutMs))]);
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.backoff);
  }

  // -------------------------------------------------------------------------

  private schedule(ms: number) {
    if (this.inflight || this.backoff) return;
    if (this.timer && ms > 0) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump();
    }, ms);
  }

  private async pump() {
    if (this.inflight || !this.queue.length) return this.settle();
    const batch = this.queue.slice(0, this.o.maxBatch);
    this.inflight = this.post(batch).then(
      (outcome) => {
        this.inflight = null;
        if (outcome === 'retry') {
          this.stats.retried++;
          const base = Math.min(this.o.maxRetryMs, this.o.minRetryMs * 2 ** this.attempt++);
          this.backoff = setTimeout(() => {
            this.backoff = undefined;
            void this.pump();
          }, base / 2 + Math.random() * (base / 2));
          (this.backoff as { unref?: () => void }).unref?.();
          return;
        }
        this.attempt = 0;
        this.queue.splice(0, batch.length);
        if (outcome === 'dropped') this.stats.dropped += batch.length;
        else this.stats.sent += batch.length;
        if (this.queue.length) void this.pump();
        else this.settle();
      },
      () => {
        this.inflight = null;
      },
    );
  }

  private settle() {
    if (this.queue.length || this.inflight) return;
    const w = this.waiters.splice(0);
    w.forEach((fn) => fn());
  }

  private async post(batch: AgentWorldEvent[]): Promise<'ok' | 'retry' | 'dropped'> {
    const f = this.o.fetch ?? fetch;
    try {
      const res = await f(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.o.apiKey ? { authorization: `Bearer ${this.o.apiKey}` } : {}) },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { rejected?: number; errors?: string[] };
        if (body.rejected) this.report(new AgentWorldError(`Server rejected ${body.rejected} event(s): ${body.errors?.join('; ')}`, res.status, true));
        return 'ok';
      }
      if (res.status === 429 || res.status >= 500) return 'retry';
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      this.report(new AgentWorldError(`${res.status}: ${body.error ?? res.statusText}`, res.status, true));
      return 'dropped';
    } catch (e) {
      if (this.attempt === 0) this.report(new AgentWorldError(`Server unreachable (${errorMessage(e)}); retrying`));
      return 'retry';
    }
  }

  private report(e: AgentWorldError) {
    try {
      this.o.onError?.(e);
    } catch {
      /* never let a handler break delivery */
    }
  }
}

export class AgentHandle {
  constructor(
    private readonly client: AgentWorldClient,
    readonly id: string,
    private readonly kind: string,
  ) {}

  update(patch: Partial<Omit<AgentInit, 'id'>>) {
    this.client.send({ type: 'agent.updated', agent: { ...patch, id: this.id } });
  }

  status(status: AgentStatus, message?: string) {
    this.client.send({ type: 'agent.status', agentId: this.id, status, ...(message ? { message } : {}) });
  }

  /** Where the agent rests while idle (null = roam). */
  moveTo(destination: AgentDestination | null) {
    this.client.send({ type: 'agent.destination', agentId: this.id, destination });
  }

  remove() {
    this.client.send({ type: 'agent.removed', agentId: this.id });
  }

  /** Assigns a task (queued on the server if the agent is busy). */
  task(title: string, init: TaskInit = {}): TaskHandle {
    const task: TaskInput = {
      id: init.id ?? rid('task'),
      agentId: this.id,
      kind: init.kind ?? this.kind,
      title,
      ...(init.priority !== undefined ? { priority: init.priority } : {}),
      ...(init.stationId ? { stationId: init.stationId } : {}),
      ...(init.metadata ? { metadata: init.metadata } : {}),
    };
    this.client.send({ type: 'task.assigned', task });
    return new TaskHandle(this.client, task.id);
  }

  /**
   * Runs `fn` as a visualized task: started → your progress calls →
   * completed (or failed if `fn` throws — the error is re-thrown).
   * Waits for delivery at the end, so short scripts don't lose events.
   */
  async run<T>(title: string, fn: (task: TaskHandle) => Promise<T> | T, init: TaskInit = {}): Promise<T> {
    const task = this.task(title, init).start();
    try {
      const result = await fn(task);
      task.complete();
      return result;
    } catch (e) {
      task.fail(e);
      throw e;
    } finally {
      await this.client.flush();
    }
  }
}

export class TaskHandle {
  private progressValue = 0;
  private done = false;

  constructor(
    private readonly client: AgentWorldClient,
    readonly id: string,
  ) {}

  start() {
    this.client.send({ type: 'task.started', taskId: this.id });
    return this;
  }

  /**
   * Reports progress (0..1). `phase` is a task kind for the current step and
   * moves the agent to a matching station (e.g. "research" → "coding").
   */
  progress(value: number, message?: string, phase?: string) {
    if (this.done) return this;
    this.progressValue = Math.max(this.progressValue, Math.min(1, Math.max(0, value)));
    this.client.send({
      type: 'task.progress',
      taskId: this.id,
      progress: this.progressValue,
      ...(message ? { message: message.slice(0, 500) } : {}),
      ...(phase ? { phase } : {}),
    });
    return this;
  }

  /** Progress without a number: nudges the bar forward and shows a message. */
  step(message: string, phase?: string) {
    return this.progress(this.progressValue + (1 - this.progressValue) * 0.15, message, phase);
  }

  complete(result?: unknown) {
    if (this.done) return;
    this.done = true;
    this.client.send({ type: 'task.completed', taskId: this.id, ...(result !== undefined ? { result } : {}) });
  }

  fail(error: unknown) {
    if (this.done) return;
    this.done = true;
    this.client.send({ type: 'task.failed', taskId: this.id, error: errorMessage(error).slice(0, 1000) });
  }

  cancel(reason?: string) {
    if (this.done) return;
    this.done = true;
    this.client.send({ type: 'task.cancelled', taskId: this.id, ...(reason ? { reason } : {}) });
  }
}
