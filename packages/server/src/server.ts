import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, WIRE_VERSION, type WorldConfig } from '@agent-viz/protocol';
import type { LifecycleOptions, MockSourceOptions } from '@agent-viz/core';
import { ProjectHub } from './hub';
import { can, Registry, registryPath, type KeyRole, type Principal } from './registry';
import { createStaticHandler } from './static';
import { cors, extractToken, HttpError, isLoopback, RateLimiter, readJsonBody, sendJson } from './http';

export const DEFAULT_PROJECT = 'default';

export interface AgentWorldServerOptions {
  /** Worlds projects can use, by id. The first one is the default. */
  worlds: WorldConfig[];
  port?: number;
  host?: string;
  /** Where projects, keys and world state are stored. null = memory only. */
  dataDir?: string | null;
  /** Require API keys. Off = local dev mode (loopback hosts only). */
  auth?: boolean;
  /** Allow auth-off on a non-loopback host (not recommended). */
  insecure?: boolean;
  /** Run the simulator inside a project (memory-only state for that project). */
  mock?: { projectId?: string; options?: MockSourceOptions } | false;
  batchMs?: number;
  lifecycle?: LifecycleOptions;
  maxPayload?: number;
  /** Events per second per caller (0 disables). */
  rateLimit?: { perSecond: number; burst: number };
  log?: (msg: string) => void;
  /** Serve a built web app (the dashboard) from this directory at "/". */
  staticDir?: string;
}

export interface AgentWorldServer {
  readonly registry: Registry;
  /** Set when auth is on and no admin token existed yet — print it once. */
  readonly generatedAdminToken: string | undefined;
  start(): Promise<number>;
  stop(): Promise<void>;
  hub(projectId: string): ProjectHub | undefined;
}

type Route = { projectId?: string; rest: string };

/** /events → default project; /v1/projects/:id/... → that project. */
function parseRoute(pathname: string): Route | null {
  if (pathname === '/events' || pathname === '/snapshot' || pathname === '/ws') return { projectId: DEFAULT_PROJECT, rest: pathname.slice(1) };
  const m = /^\/v1\/projects(?:\/([^/]+))?(?:\/(.*))?$/.exec(pathname);
  if (!m) return null;
  return { ...(m[1] ? { projectId: decodeURIComponent(m[1]) } : {}), rest: m[2] ?? '' };
}

export function createAgentWorldServer(opts: AgentWorldServerOptions): AgentWorldServer {
  const log = opts.log ?? (() => {});
  const auth = opts.auth ?? false;
  const host = opts.host ?? '127.0.0.1';
  if (!auth && !isLoopback(host) && !opts.insecure) {
    throw new Error(`Refusing to listen on ${host} without authentication. Use --auth (recommended) or --insecure.`);
  }
  if (!opts.worlds.length) throw new Error('At least one world is required.');
  const worlds = new Map(opts.worlds.map((w) => [w.id, w]));
  const defaultWorld = opts.worlds[0]!;
  const dataDir = opts.dataDir === undefined ? null : opts.dataDir;
  const maxPayload = opts.maxPayload ?? 256 * 1024;
  const limiter = new RateLimiter(opts.rateLimit?.perSecond ?? 500, opts.rateLimit?.burst ?? 2000);
  const mockProject = opts.mock ? (opts.mock.projectId ?? DEFAULT_PROJECT) : undefined;

  const serveStatic = opts.staticDir ? createStaticHandler(opts.staticDir) : undefined;
  const registry = new Registry(dataDir ? registryPath(dataDir) : null);
  let generatedAdminToken: string | undefined;
  if (auth && !registry.hasAdminToken()) generatedAdminToken = registry.resetAdminToken();
  if (!registry.getProject(DEFAULT_PROJECT)) registry.createProject({ id: DEFAULT_PROJECT, name: 'Default', worldId: defaultWorld.id });
  if (mockProject && !registry.getProject(mockProject)) registry.createProject({ id: mockProject, worldId: defaultWorld.id });

  const hubs = new Map<string, ProjectHub>();
  const getHub = (projectId: string): ProjectHub | undefined => {
    let hub = hubs.get(projectId);
    if (hub) return hub;
    let project = registry.getProject(projectId);
    // dev mode: projects appear on first use
    if (!project && !auth) {
      try {
        project = registry.createProject({ id: projectId, worldId: defaultWorld.id });
      } catch {
        return undefined;
      }
    }
    if (!project) return undefined;
    const isMock = projectId === mockProject;
    hub = new ProjectHub({
      projectId,
      world: worlds.get(project.worldId) ?? defaultWorld,
      batchMs: opts.batchMs ?? 50,
      ...(opts.lifecycle ? { lifecycle: opts.lifecycle } : {}),
      ...(dataDir && !isMock ? { persistFile: path.join(dataDir, 'projects', projectId, 'state.json') } : {}),
      ...(isMock ? { mock: opts.mock ? (opts.mock.options ?? {}) : {} } : {}),
    });
    hubs.set(projectId, hub);
    return hub;
  };

  const principalFor = (req: IncomingMessage, url: URL): Principal => {
    const token = extractToken(req, url);
    const p = registry.authenticate(token);
    if (p) return p;
    if (!auth) return { kind: 'anonymous' };
    throw new HttpError(401, token ? 'Invalid or revoked API key' : 'Missing API key', 'unauthorized');
  };
  const authorize = (p: Principal, projectId: string, action: 'read' | 'write' | 'admin') => {
    if (!can(p, projectId, action)) throw new HttpError(403, `This key cannot ${action} project "${projectId}"`, 'forbidden');
  };
  const callerId = (p: Principal, req: IncomingMessage) => (p.kind === 'key' ? p.key.id : p.kind === 'admin' ? 'admin' : `ip:${req.socket.remoteAddress}`);

  // --- HTTP -----------------------------------------------------------------
  async function handle(req: IncomingMessage, res: ServerResponse) {
    cors(res);
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, version: WIRE_VERSION, auth, projects: registry.listProjects().length });
    }

    // the list of worlds isn't secret: viewers and pickers need it before signing in
    if (req.method === 'GET' && url.pathname === '/v1/worlds') {
      return sendJson(res, 200, {
        default: defaultWorld.id,
        worlds: opts.worlds.map((w) => ({ id: w.id, name: w.name, ...(w.description ? { description: w.description } : {}) })),
      });
    }

    const route = parseRoute(url.pathname);
    if (!route) {
      if (serveStatic?.(req, res, url.pathname)) return;
      throw new HttpError(404, 'Not found', 'not_found');
    }
    const p = principalFor(req, url);

    // /v1/projects  (collection)
    if (!route.projectId) {
      authorize(p, '*', 'admin');
      if (req.method === 'GET') return sendJson(res, 200, { projects: registry.listProjects().map((pr) => describeProject(pr.id)) });
      if (req.method === 'POST') {
        const body = (await readJsonBody(req, maxPayload)) as { id?: string; name?: string; worldId?: string } | undefined;
        if (!body?.id) throw new HttpError(400, 'Body must include "id"', 'bad_request');
        if (body.worldId && !worlds.has(body.worldId)) throw new HttpError(400, `Unknown world "${body.worldId}"`, 'bad_request');
        try {
          const project = registry.createProject({ id: body.id, ...(body.name ? { name: body.name } : {}), worldId: body.worldId ?? defaultWorld.id });
          log(`project created: ${project.id}`);
          return sendJson(res, 201, { project });
        } catch (e) {
          throw new HttpError(409, (e as Error).message, 'conflict');
        }
      }
      throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
    }

    const pid = route.projectId;
    const project = registry.getProject(pid);
    if (!project && auth) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');

    switch (`${req.method} ${route.rest}`) {
      case 'GET ': {
        authorize(p, pid, 'read');
        if (!registry.getProject(pid) && !getHub(pid)) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');
        return sendJson(res, 200, { project: describeProject(pid) });
      }
      case 'PATCH ': {
        authorize(p, pid, 'admin');
        if (!project) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');
        const body = (await readJsonBody(req, maxPayload)) as { name?: unknown; worldId?: unknown } | undefined;
        const patch: { name?: string; worldId?: string } = {};
        if (body?.name !== undefined) {
          if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) throw new HttpError(400, '"name" must be 1-80 characters', 'bad_request');
          patch.name = body.name.trim();
        }
        if (body?.worldId !== undefined) {
          const world = typeof body.worldId === 'string' ? worlds.get(body.worldId) : undefined;
          if (!world) throw new HttpError(400, `Unknown world "${String(body.worldId)}"`, 'bad_request');
          patch.worldId = world.id;
          hubs.get(pid)?.setWorld(world);
        }
        registry.updateProject(pid, patch);
        if (patch.worldId) log(`project ${pid}: world is now ${patch.worldId}`);
        return sendJson(res, 200, { project: describeProject(pid) });
      }
      case 'DELETE ': {
        authorize(p, pid, 'admin');
        if (!project) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');
        if (pid === DEFAULT_PROJECT) throw new HttpError(400, 'The default project cannot be deleted', 'bad_request');
        hubs.get(pid)?.close(4404, 'project deleted');
        hubs.delete(pid);
        registry.deleteProject(pid);
        if (dataDir) fs.rmSync(path.join(dataDir, 'projects', pid), { recursive: true, force: true });
        log(`project deleted: ${pid}`);
        return sendJson(res, 200, { deleted: pid });
      }
      case 'POST events': {
        authorize(p, pid, 'write');
        const body = await readJsonBody(req, maxPayload);
        const items = Array.isArray(body) ? body : [body];
        if (!limiter.take(callerId(p, req), items.length)) throw new HttpError(429, 'Rate limit exceeded', 'rate_limited');
        const hub = getHub(pid);
        if (!hub) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');
        const r = hub.ingest(items, 'http');
        return sendJson(res, r.accepted ? 202 : 400, r);
      }
      case 'GET snapshot': {
        authorize(p, pid, 'read');
        const hub = getHub(pid);
        if (!hub) throw new HttpError(404, `Unknown project "${pid}"`, 'not_found');
        return sendJson(res, 200, { serverTime: Date.now(), worldId: hub.worldId, state: hub.store.getState().snapshot() });
      }
      case 'GET keys': {
        authorize(p, pid, 'admin');
        return sendJson(res, 200, { keys: registry.listKeys(pid) });
      }
      case 'POST keys': {
        authorize(p, pid, 'admin');
        const body = (await readJsonBody(req, maxPayload)) as { role?: KeyRole; name?: string } | undefined;
        const role = body?.role ?? 'write';
        if (role !== 'write' && role !== 'read') throw new HttpError(400, 'role must be "write" or "read"', 'bad_request');
        const created = registry.createKey(pid, role, body?.name);
        log(`key created: ${created.record.id} (${role}) for ${pid}`);
        return sendJson(res, 201, created);
      }
    }
    const keyDel = /^keys\/([^/]+)$/.exec(route.rest);
    if (req.method === 'DELETE' && keyDel) {
      authorize(p, pid, 'admin');
      const keyId = decodeURIComponent(keyDel[1]!);
      const k = registry.listKeys(pid).find((x) => x.id === keyId);
      if (!k || !registry.revokeKey(keyId)) throw new HttpError(404, 'Unknown or already revoked key', 'not_found');
      return sendJson(res, 200, { revoked: keyId });
    }
    throw new HttpError(404, 'Not found', 'not_found');
  }

  function describeProject(id: string) {
    const pr = registry.getProject(id)!;
    const hub = hubs.get(id);
    return { ...pr, live: !!hub, viewers: hub?.viewerCount() ?? 0, metrics: hub?.metrics() };
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message, code: e.code });
      else {
        log(`error: ${(e as Error).stack ?? e}`);
        sendJson(res, 500, { error: 'Internal error', code: 'internal' });
      }
    });
  });

  // --- WebSocket ------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = parseRoute(url.pathname);
    if (!route?.projectId || route.rest !== 'ws') return void socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Accept, then close with a 44xx code: clients see the reason and stop retrying.
      let p: Principal;
      try {
        p = principalFor(req, url);
        authorize(p, route.projectId!, 'read');
      } catch (e) {
        const err = e as HttpError;
        return ws.close(err.status === 403 ? 4403 : 4401, err.message.slice(0, 120));
      }
      const hub = getHub(route.projectId!);
      if (!hub) return ws.close(4404, 'unknown project');
      attachViewer(ws, hub, p, req);
    });
  });

  function attachViewer(ws: WebSocket, hub: ProjectHub, p: Principal, req: IncomingMessage) {
    const canWrite = can(p, hub.projectId, 'write');
    log(`viewer connected to ${hub.projectId} (${hub.viewerCount() + 1})`);
    hub.addViewer(ws, canWrite, (v, data) => {
      const msg = parseClientMessage(data);
      if (!msg) return hub.send(ws, { kind: 'error', message: 'invalid message', code: 'bad_request' });
      if (msg.kind === 'ping') return hub.send(ws, { kind: 'pong', serverTime: Date.now() });
      if (!v.canWrite) return hub.send(ws, { kind: 'error', message: 'This key is read-only', code: 'forbidden' });
      if (!limiter.take(callerId(p, req), msg.events.length)) return hub.send(ws, { kind: 'error', message: 'Rate limit exceeded', code: 'rate_limited' });
      const r = hub.ingest(msg.events, 'ws');
      if (r.rejected) hub.send(ws, { kind: 'error', message: r.errors.join('; '), code: 'invalid_event' });
    });
  }

  let usageTimer: ReturnType<typeof setInterval> | undefined;

  return {
    registry,
    generatedAdminToken,
    hub: (id) => getHub(id),
    start: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(opts.port ?? 8787, host, () => {
          if (mockProject) getHub(mockProject); // start the simulator now
          usageTimer = setInterval(() => registry.flushUsage(), 30_000);
          usageTimer.unref?.();
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : (opts.port ?? 8787));
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        clearInterval(usageTimer);
        for (const hub of hubs.values()) hub.close();
        hubs.clear();
        registry.flushUsage();
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
