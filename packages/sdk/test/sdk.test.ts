import { afterEach, describe, expect, it } from 'vitest';
import { meadowIsland } from '@agent-world/engine/presets';
import { createAgentWorldServer, type AgentWorldServer } from '@agent-world/server';
import { AgentWorldClient, type AgentWorldError } from '../src';

let server: AgentWorldServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function boot(auth = false) {
  server = createAgentWorldServer({ worlds: [meadowIsland], port: 0, auth, lifecycle: { settleMs: 0, staleMs: 0 } });
  const port = await server.start();
  return `http://127.0.0.1:${port}`;
}
const state = (project = 'default') => server!.hub(project)!.store.getState();

describe('AgentWorldClient', () => {
  it('registers agents and runs tasks end to end', async () => {
    const url = await boot();
    const client = new AgentWorldClient({ url, project: 'demo' });
    const scout = client.agent({ id: 'scout', name: 'Scout', kind: 'research' });

    const result = await scout.run('Find competitors', async (task) => {
      task.progress(0.3, 'Searching');
      task.step('Writing summary', 'writing');
      return 42;
    });
    expect(result).toBe(42);
    const s = state('demo');
    const task = Object.values(s.tasks)[0]!;
    expect(task).toMatchObject({ title: 'Find competitors', status: 'completed', phase: 'writing' });
    expect(s.agents.scout?.stats.completed).toBe(1);
    expect(client.stats.sent).toBeGreaterThan(0);
  });

  it('reports a thrown error as a failed task and re-throws', async () => {
    const url = await boot();
    const client = new AgentWorldClient({ url });
    const bot = client.agent({ id: 'bot', name: 'Bot', kind: 'coding' });
    await expect(bot.run('Deploy', () => Promise.reject(new Error('disk full')))).rejects.toThrow('disk full');
    expect(Object.values(state().tasks)[0]).toMatchObject({ status: 'failed', error: 'disk full' });
  });

  it('batches many calls into few requests, in order', async () => {
    const url = await boot();
    let requests = 0;
    const client = new AgentWorldClient({ url, fetch: (i, init) => (requests++, fetch(i, init)) });
    const a = client.agent({ id: 'a', name: 'A', kind: 'research' });
    const t = a.task('Big job').start();
    for (let i = 1; i <= 50; i++) t.progress(i / 60, `step ${i}`);
    t.complete();
    await client.flush();
    expect(requests).toBe(1);
    expect(state().tasks[t.id]?.status).toBe('completed');
  });

  it('queues while the server is down and delivers once it is back', async () => {
    const errors: AgentWorldError[] = [];
    // grab a free port, then stop so nothing listens yet
    const url = await boot();
    const port = Number(new URL(url).port);
    await server!.stop();
    const client = new AgentWorldClient({ url, minRetryMs: 30, maxRetryMs: 60, onError: (e) => errors.push(e) });
    client.agent({ id: 'late', name: 'Late', kind: 'coding' });
    await new Promise((r) => setTimeout(r, 120));
    expect(client.pending).toBe(1);
    expect(errors[0]?.message).toMatch(/unreachable/);

    server = createAgentWorldServer({ worlds: [meadowIsland], port });
    await server.start();
    await client.flush();
    expect(state().agents.late).toBeDefined();
  });

  it('drops (and reports) batches the server refuses, e.g. a bad key', async () => {
    const url = await boot(true);
    const errors: AgentWorldError[] = [];
    const client = new AgentWorldClient({ url, apiKey: 'aww_bogus', onError: (e) => errors.push(e) });
    client.agent({ name: 'X', kind: 'coding' });
    await client.flush();
    expect(errors[0]).toMatchObject({ status: 401, dropped: true });
    expect(client.stats.dropped).toBe(1);

    const admin = server!.generatedAdminToken!;
    const key = (await (await fetch(`${url}/v1/projects/default/keys`, { method: 'POST', headers: { authorization: `Bearer ${admin}` }, body: '{}' })).json()).key;
    const ok = new AgentWorldClient({ url, apiKey: key });
    ok.agent({ id: 'authed', name: 'Authed', kind: 'coding' });
    await ok.flush();
    expect(state().agents.authed).toBeDefined();
  });

  it('caps the offline queue', async () => {
    const client = new AgentWorldClient({ url: 'http://127.0.0.1:1', maxQueue: 5, minRetryMs: 10_000 });
    for (let i = 0; i < 8; i++) client.send({ type: 'agent.removed', agentId: String(i) });
    expect(client.pending).toBe(5);
    expect(client.stats.dropped).toBe(3);
    await client.close(10);
  });
});
