#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meadowIsland } from '@agent-viz/engine/presets';
import { createAgentWorldServer, DEFAULT_PROJECT } from './server';
import { Registry, registryPath, type KeyRole } from './registry';

const HELP = `Agent World server

  serve (default)          start the server
    --port <n>             default 8787
    --host <addr>          default 127.0.0.1
    --data <dir>           where projects/keys/state live (default ./.agent-world-data)
    --memory               keep everything in memory (no data dir)
    --auth                 require API keys (needed for non-localhost hosts)
    --insecure             allow --host 0.0.0.0 without --auth (not recommended)
    --mock [project]       run the simulator in a project (default: "default")
    --dashboard <dir>      serve a built console from <dir> (auto-detected; --no-dashboard to disable)

  projects list
  projects create <id> [--name <name>]
  projects delete <id>
  keys list [--project <id>]
  keys create --project <id> [--role write|read] [--name <label>]
  keys revoke <keyId>
  admin-token reset        print a new admin token (invalidates the old one)

  claude-install           show your Claude Code sessions as robots (adds hooks)
    --project <dir>        that project only (default: the current folder)
    --user                 every Claude Code session on this machine
    --world-project <id>   Agent World project to report into
    --key <write key>      needed when the server runs with --auth
    --url <base url>       default http://127.0.0.1:8787
    --dry-run              print the settings without writing
  claude-uninstall         remove those hooks (same --project / --user)

  All management commands take --data <dir> too and work while the server runs.
`;

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  const v = argv[i + 1];
  return i >= 0 && v && !v.startsWith('--') ? v : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--') && opt(argv[i - 1]!.slice(2)) === a));
const dataDir = path.resolve(opt('data') ?? '.agent-world-data');

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function serve() {
  const port = Number(opt('port') ?? 8787);
  const host = opt('host') ?? '127.0.0.1';
  const auth = flag('auth');
  const mockIdx = argv.indexOf('--mock');
  const mockProject = mockIdx >= 0 ? (opt('mock') ?? DEFAULT_PROJECT) : undefined;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [opt('dashboard'), path.resolve(here, '../../../apps/dashboard/dist'), path.resolve(here, 'dashboard')].filter(Boolean) as string[];
  const staticDir = flag('no-dashboard') ? undefined : candidates.find((d) => fs.existsSync(path.join(d, 'index.html')));

  const server = createAgentWorldServer({
    ...(staticDir ? { staticDir } : {}),
    worlds: [meadowIsland],
    port,
    host,
    auth,
    insecure: flag('insecure'),
    dataDir: flag('memory') ? null : dataDir,
    mock: mockProject ? { projectId: mockProject, options: { agentCount: 9, seed: 7 } } : false,
    log: (m) => console.log(`[agent-world] ${m}`),
  });
  const bound = await server.start();
  const base = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${bound}`;
  console.log(`[agent-world] listening on http://${host}:${bound}  (auth ${auth ? 'ON' : 'off — local dev mode'})`);
  console.log(`  data:       ${flag('memory') ? 'memory only' : dataDir}`);
  console.log(staticDir ? `  console:    ${base}/` : '  console:    not built (run: npm run build:dashboard)');
  if (server.generatedAdminToken) {
    console.log('\n  ADMIN TOKEN (shown once, store it safely):');
    console.log(`  ${server.generatedAdminToken}\n`);
  }
  console.log(`  ingest:     POST ${base}/v1/projects/<project>/events`);
  console.log(`  viewer:     ws://${base.slice(7)}/v1/projects/<project>/ws`);
  console.log(`  playground: http://localhost:5173/?server=${base}&project=${mockProject ?? DEFAULT_PROJECT}${auth ? '&token=<read key>' : ''}`);
  if (mockProject) console.log(`  simulator:  running in project "${mockProject}"`);
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function manage(cmd: string, sub: string | undefined) {
  const reg = new Registry(registryPath(dataDir));
  const id = positional[2];
  switch (`${cmd} ${sub}`) {
    case 'projects list':
      for (const p of reg.listProjects()) console.log(`${p.id.padEnd(24)} ${p.name}  (world: ${p.worldId})`);
      return;
    case 'projects create': {
      if (!id) fail('usage: projects create <id> [--name <name>]');
      try {
        const p = reg.createProject({ id, ...(opt('name') ? { name: opt('name')! } : {}) });
        console.log(`created project ${p.id}`);
      } catch (e) {
        fail((e as Error).message);
      }
      return;
    }
    case 'projects delete':
      if (!id) fail('usage: projects delete <id>');
      if (id === DEFAULT_PROJECT) fail('the default project cannot be deleted');
      console.log(reg.deleteProject(id) ? `deleted ${id} (and its keys)` : `no project ${id}`);
      return;
    case 'keys list':
      for (const k of reg.listKeys(opt('project')))
        console.log(`${k.id}  ${k.prefix}…  ${k.role.padEnd(5)}  ${k.projectId.padEnd(16)} ${k.name}${k.revokedAt ? '  [revoked]' : ''}`);
      return;
    case 'keys create': {
      const project = opt('project') ?? fail('--project is required');
      const role = (opt('role') ?? 'write') as KeyRole;
      if (role !== 'write' && role !== 'read') fail('--role must be write or read');
      try {
        const { key, record } = reg.createKey(project, role, opt('name'));
        console.log(`created ${record.role} key ${record.id} for ${project}. Copy it now, it is not shown again:\n\n  ${key}\n`);
      } catch (e) {
        fail((e as Error).message);
      }
      return;
    }
    case 'keys revoke':
      if (!id) fail('usage: keys revoke <keyId>');
      console.log(reg.revokeKey(id) ? `revoked ${id}` : `no active key ${id}`);
      return;
    case 'admin-token reset':
      console.log(`new admin token (old one no longer works):\n\n  ${reg.resetAdminToken()}\n`);
      return;
  }
  fail(`unknown command "${cmd} ${sub ?? ''}"\n\n${HELP}`);
}

/** Runs the Claude Code bridge installer (shipped in dist/claude-code, or the repo's integrations/). */
function claudeInstall(uninstall: boolean): never {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = [path.resolve(here, 'claude-code/install.mjs'), path.resolve(here, '../../../integrations/claude-code/install.mjs')].find((p) =>
    fs.existsSync(p),
  );
  if (!script) fail('the Claude Code bridge is not included in this build');
  const rest = argv.slice(argv.indexOf(positional[0]!) + 1);
  if (!['--project', '--user', '--file'].some((f) => rest.includes(f))) rest.push('--project', process.cwd());
  if (uninstall) rest.push('--uninstall');
  const r = spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const [cmd, sub] = positional;
if (flag('help') || cmd === 'help') console.log(HELP);
else if (cmd === 'claude-install' || cmd === 'claude-uninstall') claudeInstall(cmd === 'claude-uninstall');
else if (!cmd || cmd === 'serve') await serve();
else manage(cmd, sub);
