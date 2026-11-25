import fs from 'node:fs';
import path from 'node:path';
import type { WorldSnapshot } from '@agent-world/protocol';

/** Write via temp file + rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/**
 * Debounced snapshot writer for one project's world state.
 * Saves at most every `intervalMs` while changes keep coming, plus on close.
 */
export class SnapshotStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(
    private readonly file: string,
    private readonly read: () => WorldSnapshot,
    private readonly intervalMs = 2000,
  ) {}

  load(): WorldSnapshot | undefined {
    const s = readJson<{ version: number; state: WorldSnapshot }>(this.file);
    return s?.version === 1 ? s.state : undefined;
  }

  markDirty() {
    this.dirty = true;
    this.timer ??= setTimeout(() => this.flush(), this.intervalMs);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty) return;
    this.dirty = false;
    try {
      writeJsonAtomic(this.file, { version: 1, savedAt: Date.now(), state: this.read() });
    } catch {
      this.dirty = true; // retry on next change
    }
  }
}
