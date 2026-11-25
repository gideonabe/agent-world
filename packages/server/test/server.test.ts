import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentWorldStore, WebSocketEventSource, type AgentWorldStore, type ConnectionStatus } from '@agent-world/core';
import { meadowIsland } from '@agent-world/engine/presets';
import { createAgentWorldServer, type AgentWorldServer, type AgentWorldServerOptions } from '../src';

const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

let server: AgentWorldServer | undefined;
const sockets: WebSocketEventSource[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.stop());
  await server?.stop();
  server = undefined;
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-test-'));
  tmpDirs.push(d);
  return d;
};

async function boot(o: Partial<AgentWorldServerOptions> = {}) {
  server = createAgentWorldServer({ worlds: [meadowIsland], port: 0, batchMs: 10, lifecycle: { settleMs: 0, staleMs: 0 }, ...o });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  const call = async (method: string, p: string, body?: unknown, token?: string) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { port, base, call };
}

function viewer(port: number, project: string, token?: string) {
  const store: AgentWorldStore = createAgentWorldStore(meadowIsland, { lifecycle: false });
  const src = new WebSocketEventSource({ url: `ws://127.0.0.1:${port}/v1/projects/${project}/ws`, pingMs: 0, minBackoffMs: 20, ...(token ? { token } : {}) });
  sockets.push(src);
  let status: ConnectionStatus = 'idle';
  src.onStatus((s) => (status = s));
  store.getState().connect(src);
  return { store, src, status: () => status };
}

const reg = (id: string) => ({ type: 'agent.registered', agent: { id, name: id, kind: 'research' } });

describe('dev mode (auth off)', () => {
  it('keeps the legacy endpoints, auto-creates projects and fans out to viewers', async () => {
    const { port, call } = await boot();
    expect((await call('POST', '/events', reg('a1'))).status).toBe(202); // legacy → default project
    const v = viewer(port, 'default');
    await until(() => !!v.store.getState().agents.a1);

    expect((await call('POST', '/v1/projects/side-project/events', [reg('b1')])).status).toBe(202);
    const snap = await call('GET', '/v1/projects/side-project/snapshot');
    expect(Object.keys(snap.body.state.agents)).toEqual(['b1']);
    expect(v.store.getState().agents.b1).toBeUndefined(); // projects are isolated
  });

  it('refuses a non-loopback host without auth', () => {
    expect(() => createAgentWorldServer({ worlds: [meadowIsland], host: '0.0.0.0' })).toThrow(/without authentication/);
  });
});

describe('auth mode', () => {
  it('enforces API keys, roles and project scoping', async () => {
    const { port, call } = await boot({ auth: true, dataDir: tmp() });
    const admin = server!.generatedAdminToken!;
    expect(admin).toMatch(/^awadm_/);

    expect((await call('POST', '/v1/projects/default/events', reg('x'))).status).toBe(401);
    expect((await call('POST', '/v1/projects/default/events', reg('x'), 'awk_wrong')).status).toBe(401);

    expect((await call('POST', '/v1/projects', { id: 'vakori', name: 'Vakori' }, admin)).status).toBe(201);
    expect((await call('POST', '/v1/projects', { id: 'vakori' }, admin)).status).toBe(409);
    const write = (await call('POST', '/v1/projects/vakori/keys', { role: 'write', name: 'ci' }, admin)).body.key as string;
    const read = (await call('POST', '/v1/projects/vakori/keys', { role: 'read' }, admin)).body.key as string;
    expect(write).toMatch(/^aww_/);

    expect((await call('POST', '/v1/projects/vakori/events', reg('bot'), write)).status).toBe(202);
    expect((await call('POST', '/v1/projects/vakori/events', reg('bot'), read)).status).toBe(403); // read-only
    expect((await call('POST', '/v1/projects/default/events', reg('bot'), write)).status).toBe(403); // other project
    expect((await call('GET', '/v1/projects', undefined, write)).status).toBe(403); // admin only
    expect((await call('GET', '/v1/projects/vakori/snapshot', undefined, read)).status).toBe(200);
    expect((await call('POST', '/v1/projects/nope/events', reg('z'), admin)).status).toBe(404);

    // keys are hashed at rest
    const raw = fs.readFileSync(path.join(tmpDirs[0]!, 'registry.json'), 'utf8');
    expect(raw).not.toContain(write);

    // viewers: read key may watch but not command; bad key is rejected without retry loops
    const ok = viewer(port, 'vakori', read);
    await until(() => !!ok.store.getState().agents.bot);
    const bad = viewer(port, 'vakori', 'awr_nope');
    await until(() => bad.status() === 'closed');
    expect(bad.src.lastError).toMatch(/Invalid/);

    // revocation applies immediately
    const keyId = (await call('GET', '/v1/projects/vakori/keys', undefined, admin)).body.keys.find((k: any) => k.role === 'write').id;
    expect((await call('DELETE', `/v1/projects/vakori/keys/${keyId}`, undefined, admin)).status).toBe(200);
    expect((await call('POST', '/v1/projects/vakori/events', reg('bot2'), write)).status).toBe(401);
  });

  it('rate limits per key', async () => {
    const { call } = await boot({ auth: true, rateLimit: { perSecond: 1, burst: 3 } });
    const admin = server!.generatedAdminToken!;
    const key = (await call('POST', '/v1/projects/default/keys', { role: 'write' }, admin)).body.key;
    expect((await call('POST', '/v1/projects/default/events', [reg('a'), reg('b'), reg('c')], key)).status).toBe(202);
    expect((await call('POST', '/v1/projects/default/events', [reg('d')], key)).status).toBe(429);
  });
});

describe('persistence', () => {
  it('restores projects, keys and world state after a restart', async () => {
    const dir = tmp();
    let { call } = await boot({ auth: true, dataDir: dir });
    const admin = server!.generatedAdminToken!;
    await call('POST', '/v1/projects', { id: 'keep' }, admin);
    const key = (await call('POST', '/v1/projects/keep/keys', { role: 'write' }, admin)).body.key;
    await call('POST', '/v1/projects/keep/events', [reg('a1'), { type: 'task.assigned', task: { id: 't1', agentId: 'a1', kind: 'research', title: 'Persist me' } }], key);
    await server!.stop(); // flushes state

    ({ call } = await boot({ auth: true, dataDir: dir }));
    expect(server!.generatedAdminToken).toBeUndefined(); // admin token survives too
    const snap = await call('GET', '/v1/projects/keep/snapshot', undefined, key);
    expect(snap.status).toBe(200);
    expect(snap.body.state.tasks.t1.title).toBe('Persist me');
    expect(snap.body.state.agents.a1.stationId).toBe('research-lab');
  });
});

describe('simulator', () => {
  it('routes viewer commands for simulated agents to the simulator', async () => {
    const { port } = await boot({ mock: { projectId: 'demo', options: { agentCount: 1, idleMs: [60000, 60000], taskMs: [60000, 60000], seed: 3 } } });
    const v = viewer(port, 'demo');
    await until(() => Object.keys(v.store.getState().agents).length === 1);
    const id = Object.keys(v.store.getState().agents)[0]!;
    v.src.send([{ type: 'task.assigned', task: { id: 'ignored', agentId: id, kind: 'writing', title: 'Remote task' } }]);
    await until(() => v.store.getState().agents[id]?.status === 'working');
    expect(v.store.getState().agents[id]?.stationId).toBe('writers-nook');
  });
});
