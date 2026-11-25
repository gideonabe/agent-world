import { describe, expect, it } from 'vitest';
import { createEnvelope, parseClientMessage, parseServerMessage, type WorldConfig } from '@agent-viz/protocol';
import { createAgentWorldStore, WebSocketEventSource, type ConnectionStatus, type WebSocketLike } from '../src';

const world: WorldConfig = {
  id: 't',
  name: 'T',
  island: { radius: 10, seed: 1 },
  navigation: { nodes: [{ id: 'a', position: [0, 0] }], edges: [] },
  stations: [{ id: 'lab', name: 'Lab', kind: 'research', accepts: ['*'], position: [1, 0], entryNode: 'a', slots: [{ position: [0, 0], facing: 0 }] }],
};

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const src = new WebSocketEventSource({
    url: 'ws://x/ws',
    token: 'secret',
    minBackoffMs: 5,
    maxBackoffMs: 10,
    pingMs: 0,
    createSocket: (u) => {
      const s = new FakeSocket(u);
      sockets.push(s);
      return s;
    },
  });
  const store = createAgentWorldStore(world, { lifecycle: false });
  const statuses: ConnectionStatus[] = [];
  src.onStatus((s) => statuses.push(s));
  store.getState().connect(src);
  return { src, store, sockets, statuses };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('WebSocketEventSource', () => {
  it('passes the token, hydrates from snapshots and applies event batches', () => {
    const { store, sockets, statuses } = setup();
    expect(sockets[0]!.url).toBe('ws://x/ws?token=secret');
    sockets[0]!.open();
    expect(statuses).toEqual(['idle', 'connecting', 'open']);

    const other = createAgentWorldStore(world, { lifecycle: false });
    other.getState().registerAgent({ id: 'a1', name: 'A', kind: 'research' });
    sockets[0]!.receive({ kind: 'snapshot', serverTime: 1, state: other.getState().snapshot() });
    expect(store.getState().agents.a1?.status).toBe('idle');

    sockets[0]!.receive({
      kind: 'events',
      envelopes: [createEnvelope({ type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'x' } })],
    });
    expect(store.getState().agents.a1?.currentTaskId).toBe('t1');
  });

  it('ignores malformed frames', () => {
    const { store, sockets } = setup();
    sockets[0]!.open();
    sockets[0]!.onmessage?.({ data: '{not json' });
    sockets[0]!.receive({ kind: 'events', envelopes: [{ nope: 1 }] });
    expect(store.getState().log).toEqual([]);
  });

  it('buffers upstream events while offline and flushes on open', () => {
    const { src, sockets } = setup();
    src.send([{ type: 'agent.removed', agentId: 'z' }]);
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.open();
    const msg = parseClientMessage(sockets[0]!.sent[0]);
    expect(msg).toMatchObject({ kind: 'events', events: [{ type: 'agent.removed', agentId: 'z' }] });
  });

  it('reconnects with backoff after a drop, but not after an auth rejection', async () => {
    const { src, sockets, statuses } = setup();
    sockets[0]!.open();
    sockets[0]!.drop();
    expect(statuses.at(-1)).toBe('reconnecting');
    await wait(30);
    expect(sockets.length).toBe(2);
    sockets[1]!.open();
    expect(src.status).toBe('open');

    sockets[1]!.drop(4401);
    await wait(30);
    expect(src.status).toBe('closed');
    expect(sockets.length).toBe(2);
  });

  it('stop() closes cleanly without reconnecting', async () => {
    const { src, sockets } = setup();
    sockets[0]!.open();
    src.stop();
    await wait(20);
    expect(sockets.length).toBe(1);
    expect(src.status).toBe('closed');
  });
});

describe('wire schema', () => {
  it('validates server and client frames', () => {
    expect(parseServerMessage('{"kind":"pong","serverTime":5}')).toEqual({ kind: 'pong', serverTime: 5 });
    expect(parseServerMessage({ kind: 'events', envelopes: [{}] })).toBeNull();
    expect(parseClientMessage({ kind: 'events', events: [{ type: 'task.started', taskId: 't' }] })).not.toBeNull();
    expect(parseClientMessage({ kind: 'events', events: [{ type: 'nope' }] })).toBeNull();
  });
});
