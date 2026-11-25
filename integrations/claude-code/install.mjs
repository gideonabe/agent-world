#!/usr/bin/env node
// Adds (or removes) the Agent World hooks in a Claude Code settings file.
//
//   node install.mjs --project <path-to-your-project>   → <project>/.claude/settings.local.json (personal, not committed)
//   node install.mjs --user                             → ~/.claude/settings.json (every Claude Code session)
//   add --uninstall to remove, --dry-run to print the result without writing.
//
// Server options (stored as hook arguments):
//   --world-project <id>   Agent World project to report into (default: the server's "default")
//   --key <write key>      API key, when the server runs with --auth
//   --url <base url>       server URL (default http://127.0.0.1:8787)
//
// Existing settings and hooks are preserved; a timestamped backup is written first.
//
// Also available from the published server package:
//   npx @agent-viz/server claude-install [--project <dir> | --user] [...]
// When run from an installed package (node_modules or the npx cache), the hook scripts are
// copied to ~/.agent-world/claude-code first, so the hooks keep working after npx cleans up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_FILES = ['agent-world-hook.mjs', 'mapping.mjs'];
const installedFromPackage = /[\\/](node_modules|_npx)[\\/]/.test(HERE);
const HOOK_DIR = installedFromPackage ? path.join(os.homedir(), '.agent-world', 'claude-code') : HERE;
const HOOK = path.join(HOOK_DIR, 'agent-world-hook.mjs').replace(/\\/g, '/');
const NODE = process.execPath.replace(/\\/g, '/');

/** event → matcher (null = event takes no matcher). */
const EVENTS = {
  SessionStart: null,
  UserPromptSubmit: null,
  PreToolUse: '*',
  PostToolUseFailure: '*',
  PermissionRequest: '*',
  Notification: null,
  SubagentStart: null,
  SubagentStop: null,
  Stop: null,
  StopFailure: null,
  SessionEnd: null,
};

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

let target;
if (has('--user')) target = path.join(os.homedir(), '.claude', 'settings.json');
else if (val('--project')) target = path.join(path.resolve(val('--project')), '.claude', 'settings.local.json');
else if (val('--file')) target = path.resolve(val('--file'));
else {
  console.error('Usage: node install.mjs (--project <dir> | --user | --file <settings.json>) [--uninstall] [--dry-run]');
  process.exit(1);
}

const isOurs = (h) => h?.type === 'command' && Array.isArray(h.args) && h.args.some((a) => String(a).replace(/\\/g, '/').endsWith('agent-world-hook.mjs'));

let settings = {};
if (fs.existsSync(target)) {
  try {
    settings = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (e) {
    console.error(`Refusing to edit ${target}: it is not valid JSON (${e.message}).`);
    process.exit(1);
  }
}
settings.hooks ??= {};

// 1) strip any previous Agent World entries (makes install idempotent and handles uninstall)
for (const [event, groups] of Object.entries(settings.hooks)) {
  if (!Array.isArray(groups)) continue;
  const kept = groups
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length > 0);
  if (kept.length) settings.hooks[event] = kept;
  else delete settings.hooks[event];
}

const serverArgs = [
  ...(val('--url') ? ['--url', val('--url')] : []),
  ...(val('--world-project') ? ['--project', val('--world-project')] : []),
  ...(val('--key') ? ['--key', val('--key')] : []),
];

// 2) add ours
if (!has('--uninstall')) {
  for (const [event, matcher] of Object.entries(EVENTS)) {
    const handler = {
      type: 'command',
      command: NODE,
      args: [HOOK, ...serverArgs],
      // never slow Claude down; SessionEnd runs sync so it finishes before exit
      ...(event === 'SessionEnd' ? { timeout: 3 } : { async: true, timeout: 10 }),
    };
    const group = matcher === null ? { hooks: [handler] } : { matcher, hooks: [handler] };
    (settings.hooks[event] ??= []).push(group);
  }
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

const out = JSON.stringify(settings, null, 2) + '\n';
if (has('--dry-run')) {
  console.log(`# would write ${target}\n${out}`);
  process.exit(0);
}

if (!has('--uninstall') && HOOK_DIR !== HERE) {
  fs.mkdirSync(HOOK_DIR, { recursive: true });
  for (const f of HOOK_FILES) fs.copyFileSync(path.join(HERE, f), path.join(HOOK_DIR, f));
  // the copied scripts are ES modules; make that explicit for Node
  fs.writeFileSync(path.join(HOOK_DIR, 'package.json'), '{ "type": "module" }\n');
  console.log(`Hook scripts: ${HOOK_DIR}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target)) {
  const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(target, backup);
  console.log(`Backup: ${backup}`);
}
fs.writeFileSync(target, out);
console.log(`${has('--uninstall') ? 'Removed Agent World hooks from' : 'Installed Agent World hooks into'} ${target}`);
if (!has('--uninstall')) {
  const proj = val('--world-project') ?? 'default';
  const base = (val('--url') ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
  console.log(`Start the server with:  ${installedFromPackage ? 'npx @agent-viz/server' : 'npm run server:empty   (in the agent-world folder)'}`);
  console.log(`Watch it at:            ${base}/#/p/${encodeURIComponent(proj)}`);
  if (val('--key')) console.log('Note: the API key is stored in that settings file. Keep it out of version control.');
  console.log('Restart that Claude Code session (or check /hooks) so it picks up the new hooks.');
}
