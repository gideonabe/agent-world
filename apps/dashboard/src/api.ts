import type { AgentWorldEvent } from '@agent-world/protocol';
import type { WorldMetrics } from '@agent-world/core';

export interface Connection {
  server: string;
  /** Admin token; empty when the server runs without --auth (dev mode). */
  token: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  worldId: string;
  createdAt: number;
  live: boolean;
  viewers: number;
  metrics?: WorldMetrics;
}

export interface KeyInfo {
  id: string;
  projectId: string;
  name: string;
  role: 'write' | 'read';
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface Health {
  ok: boolean;
  version: number;
  auth: boolean;
  projects: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin client for the server's admin + project HTTP API. */
export class AdminApi {
  constructor(readonly conn: Connection) {}

  get base() {
    return this.conn.server.replace(/\/+$/, '');
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(this.conn.token ? { authorization: `Bearer ${this.conn.token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(0, `Can't reach ${this.base}. Is the server running?`);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
    return data as T;
  }

  health = () => this.req<Health>('GET', '/health');
  projects = () => this.req<{ projects: ProjectInfo[] }>('GET', '/v1/projects').then((r) => r.projects);
  project = (id: string) => this.req<{ project: ProjectInfo }>('GET', `/v1/projects/${enc(id)}`).then((r) => r.project);
  createProject = (id: string, name?: string) => this.req<{ project: ProjectInfo }>('POST', '/v1/projects', { id, ...(name ? { name } : {}) });
  deleteProject = (id: string) => this.req('DELETE', `/v1/projects/${enc(id)}`);
  keys = (id: string) => this.req<{ keys: KeyInfo[] }>('GET', `/v1/projects/${enc(id)}/keys`).then((r) => r.keys);
  createKey = (id: string, role: 'write' | 'read', name: string) =>
    this.req<{ key: string; record: KeyInfo }>('POST', `/v1/projects/${enc(id)}/keys`, { role, name });
  revokeKey = (id: string, keyId: string) => this.req('DELETE', `/v1/projects/${enc(id)}/keys/${enc(keyId)}`);
  sendEvents = (id: string, events: AgentWorldEvent[] | unknown) =>
    this.req<{ accepted: number; rejected: number; errors: string[] }>('POST', `/v1/projects/${enc(id)}/events`, events);
}

const enc = encodeURIComponent;

// --- session ---------------------------------------------------------------------

const KEY = 'agent-world.console.connection';

export function loadConnection(): Connection | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(KEY);
      if (raw) return JSON.parse(raw) as Connection;
    } catch {
      /* storage blocked */
    }
  }
  return null;
}

/** Session-only by default; `remember` keeps it on this device. */
export function saveConnection(conn: Connection | null, remember = false) {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    if (conn) (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(conn));
  } catch {
    /* storage blocked: session lasts until reload */
  }
}
