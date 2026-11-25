import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './persistence';

export type KeyRole = 'write' | 'read';

export interface Project {
  id: string;
  name: string;
  worldId: string;
  createdAt: number;
}

export interface ApiKeyRecord {
  id: string;
  projectId: string;
  name: string;
  role: KeyRole;
  /** sha256 of the full key — the key itself is never stored. */
  hash: string;
  /** First characters, for recognising a key in lists. */
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

interface RegistryFile {
  version: 1;
  adminTokenHash?: string;
  projects: Project[];
  keys: ApiKeyRecord[];
}

export type Principal =
  | { kind: 'admin' }
  | { kind: 'key'; key: ApiKeyRecord }
  | { kind: 'anonymous' }; // only when auth is disabled

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

export const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * Projects + API keys, stored as one JSON file. Keys are hashed at rest and
 * shown in full exactly once (on creation). The file is re-read when it
 * changes on disk, so CLI edits (e.g. revoking a key) apply to a running server.
 */
export class Registry {
  private data: RegistryFile = { version: 1, projects: [], keys: [] };
  private byHash = new Map<string, ApiKeyRecord>();
  private mtimeMs = 0;
  private lastCheck = 0;
  private dirtyUsage = false;

  constructor(private readonly file: string | null) {
    this.reload();
  }

  // --- persistence -------------------------------------------------------------

  private reload() {
    if (!this.file || !fs.existsSync(this.file)) return this.index();
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as RegistryFile;
      this.mtimeMs = fs.statSync(this.file).mtimeMs;
    } catch (e) {
      throw new Error(`Cannot read registry ${this.file}: ${(e as Error).message}`);
    }
    this.index();
  }

  /** Picks up edits made by another process (at most once per second). */
  private refreshIfChanged() {
    if (!this.file) return;
    const now = Date.now();
    if (now - this.lastCheck < 1000) return;
    this.lastCheck = now;
    try {
      const m = fs.statSync(this.file).mtimeMs;
      if (m !== this.mtimeMs) this.reload();
    } catch {
      /* file removed: keep in-memory state */
    }
  }

  private index() {
    this.byHash = new Map(this.data.keys.map((k) => [k.hash, k]));
  }

  save() {
    this.dirtyUsage = false;
    if (!this.file) return;
    writeJsonAtomic(this.file, this.data);
    this.mtimeMs = fs.statSync(this.file).mtimeMs;
  }

  /** Persists lastUsedAt timestamps (called periodically, not per request). */
  flushUsage() {
    if (this.dirtyUsage) this.save();
  }

  // --- admin token -------------------------------------------------------------

  hasAdminToken() {
    return !!this.data.adminTokenHash;
  }

  /** Creates (or replaces) the admin token. Returns it once — store it safely. */
  resetAdminToken(): string {
    const token = `awadm_${randomToken(32)}`;
    this.data.adminTokenHash = sha256(token);
    this.save();
    return token;
  }

  // --- projects ----------------------------------------------------------------

  listProjects(): Project[] {
    this.refreshIfChanged();
    return this.data.projects.slice();
  }

  getProject(id: string): Project | undefined {
    this.refreshIfChanged();
    return this.data.projects.find((p) => p.id === id);
  }

  createProject(input: { id: string; name?: string; worldId?: string }): Project {
    if (!PROJECT_ID_RE.test(input.id)) throw new Error('Project id must be lowercase letters, digits and dashes (max 48).');
    if (this.getProject(input.id)) throw new Error(`Project "${input.id}" already exists.`);
    const p: Project = { id: input.id, name: input.name ?? input.id, worldId: input.worldId ?? 'meadow-island', createdAt: Date.now() };
    this.data.projects.push(p);
    this.save();
    return p;
  }

  deleteProject(id: string): boolean {
    const before = this.data.projects.length;
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.data.keys = this.data.keys.filter((k) => k.projectId !== id);
    this.index();
    this.save();
    return this.data.projects.length < before;
  }

  // --- keys ----------------------------------------------------------------------

  listKeys(projectId?: string): Omit<ApiKeyRecord, 'hash'>[] {
    this.refreshIfChanged();
    return this.data.keys.filter((k) => !projectId || k.projectId === projectId).map(({ hash: _h, ...rest }) => rest);
  }

  /** Returns the full key exactly once. */
  createKey(projectId: string, role: KeyRole, name = `${role} key`): { key: string; record: Omit<ApiKeyRecord, 'hash'> } {
    if (!this.getProject(projectId)) throw new Error(`Unknown project "${projectId}".`);
    const key = `aw${role === 'write' ? 'w' : 'r'}_${randomToken(24)}`;
    const record: ApiKeyRecord = {
      id: `key_${randomToken(6)}`,
      projectId,
      name,
      role,
      hash: sha256(key),
      prefix: key.slice(0, 9),
      createdAt: Date.now(),
    };
    this.data.keys.push(record);
    this.index();
    this.save();
    const { hash: _h, ...rest } = record;
    return { key, record: rest };
  }

  revokeKey(keyId: string): boolean {
    const k = this.data.keys.find((x) => x.id === keyId);
    if (!k || k.revokedAt) return false;
    k.revokedAt = Date.now();
    this.save();
    return true;
  }

  // --- authentication --------------------------------------------------------------

  /** Resolves a bearer token to a principal, or null if invalid/revoked. */
  authenticate(token: string | undefined): Principal | null {
    if (!token) return null;
    this.refreshIfChanged();
    const h = sha256(token);
    if (this.data.adminTokenHash && h === this.data.adminTokenHash) return { kind: 'admin' };
    const key = this.byHash.get(h);
    if (!key || key.revokedAt) return null;
    key.lastUsedAt = Date.now();
    this.dirtyUsage = true;
    return { kind: 'key', key };
  }
}

/** Can this principal read / write the given project? */
export function can(p: Principal, projectId: string, action: 'read' | 'write' | 'admin'): boolean {
  if (p.kind === 'anonymous' || p.kind === 'admin') return true;
  if (action === 'admin') return false;
  if (p.key.projectId !== projectId) return false;
  return action === 'read' || p.key.role === 'write';
}

export function registryPath(dataDir: string) {
  return path.join(dataDir, 'registry.json');
}
