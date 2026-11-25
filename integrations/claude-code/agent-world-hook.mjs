#!/usr/bin/env node
// Claude Code hook → Agent World bridge.
//
// Registered for several hook events (see install.mjs). Reads the hook payload
// from stdin, maps it to Agent World events and POSTs them to the server.
//
// Guarantees for Claude Code: prints nothing, never exits non-zero, never
// throws. If the server isn't running, the event is silently dropped.
//
// Configuration (command-line args written by install.mjs, or environment):
//   --url     / AGENT_WORLD_URL      server base URL   (default http://127.0.0.1:8787)
//   --project / AGENT_WORLD_PROJECT  project id        (default: the server's "default" project)
//   --key     / AGENT_WORLD_TOKEN    write API key     (needed when the server runs with --auth)
//   AGENT_WORLD_DETAIL  "full" | "minimal"   (minimal hides prompts, file names and commands)
//   AGENT_WORLD_DEBUG   file path            (append raw hook payloads, for troubleshooting)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mapHook } from './mapping.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const URL_BASE = (arg('url') || process.env.AGENT_WORLD_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const PROJECT = arg('project') || process.env.AGENT_WORLD_PROJECT;
const TOKEN = arg('key') || process.env.AGENT_WORLD_TOKEN;
const ENDPOINT = PROJECT ? `${URL_BASE}/v1/projects/${encodeURIComponent(PROJECT)}/events` : `${URL_BASE}/events`;
const DETAIL = process.env.AGENT_WORLD_DETAIL === 'minimal' ? 'minimal' : 'full';
const STATE_DIR = path.join(os.tmpdir(), 'agent-world-claude-code');

function readStdin(timeoutMs = 2000) {
  return new Promise((resolve) => {
    let data = '';
    const done = () => resolve(data);
    const t = setTimeout(done, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => {
      clearTimeout(t);
      done();
    });
    process.stdin.on('error', done);
  });
}

/** Per-turn tool counter (drives the progress bar). Appends are atomic enough for this. */
function countTool(key) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const f = path.join(STATE_DIR, `${key.replace(/[^a-zA-Z0-9-]/g, '_')}.count`);
    fs.appendFileSync(f, '.');
    return fs.statSync(f).size;
  } catch {
    return 1;
  }
}

function clearCounters(prefix) {
  try {
    const safe = prefix.replace(/[^a-zA-Z0-9-]/g, '_');
    for (const f of fs.readdirSync(STATE_DIR)) if (f.startsWith(safe)) fs.rmSync(path.join(STATE_DIR, f), { force: true });
  } catch {
    /* nothing to clean */
  }
}

async function post(events) {
  if (!events.length) return;
  const headers = { 'content-type': 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(events),
    signal: AbortSignal.timeout(2500),
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;
  if (process.env.AGENT_WORLD_DEBUG) {
    try {
      fs.appendFileSync(process.env.AGENT_WORLD_DEBUG, raw.trim() + '\n');
    } catch {
      /* ignore */
    }
  }
  const payload = JSON.parse(raw);
  const ev = payload.hook_event_name;

  let toolCount;
  const turnKey = `${payload.session_id ?? 's'}-${payload.agent_id ?? 'main'}-${payload.prompt_id ?? 'p'}`;
  if (ev === 'PreToolUse') toolCount = countTool(turnKey);

  const { events, later } = mapHook(payload, { detail: DETAIL, toolCount });
  await post(events);

  if (ev === 'Stop' || ev === 'SubagentStop') clearCounters(`${payload.session_id ?? 's'}-${payload.agent_id ?? 'main'}`);
  if (later) {
    await new Promise((r) => setTimeout(r, later.delayMs));
    await post(later.events);
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
