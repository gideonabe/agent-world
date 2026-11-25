// Installs the packed tarballs into a brand-new project (outside the repo) and
// checks they work as real npm packages: server starts from its bin, the SDK
// drives it, the console is served, and types + assets are present.
//
//   npm run build:packages && npm run verify:packages
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const tgz = (name) => path.join(release, fs.readdirSync(release).find((f) => f.startsWith(`agent-world-${name}-`)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-verify-'));
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};

console.log(`fresh project: ${dir}`);
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'aw-consumer', private: true, type: 'module' }));
const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', tgz('protocol'), tgz('core'), tgz('sdk'), tgz('server')], {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (install.status !== 0) throw new Error('npm install of tarballs failed');
ok('installed protocol, core, sdk, server from tarballs');

const mod = (p) => path.join(dir, 'node_modules', '@agent-world', p);
for (const p of ['protocol', 'core', 'sdk', 'server']) {
  fs.existsSync(path.join(mod(p), 'types', 'index.d.ts')) ? ok(`${p}: types present`) : fail(`${p}: missing types`);
}
fs.existsSync(path.join(mod('server'), 'dashboard', 'index.html')) ? ok('server: bundled console present') : fail('server: console missing');

// engine is checked without installing its React/three peers
// relative path: some Windows tar builds treat "C:" as a remote host
const list = spawnSync('tar', ['-tzf', path.basename(tgz('engine'))], { cwd: release }).stdout?.toString() ?? '';
if (!list) fail('could not list the engine tarball');
['package/index.js', 'package/presets.js', 'package/types/index.d.ts', 'package/assets/models/robot/RobotExpressive.glb'].forEach((f) =>
  list.includes(f) ? ok(`engine tarball has ${f.replace('package/', '')}`) : fail(`engine tarball missing ${f}`),
);

// start the installed server and drive it with the installed SDK
const port = 8795;
const server = spawn(process.execPath, [path.join(mod('server'), 'cli.js'), '--memory', '--port', String(port)], { cwd: dir });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
try {
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  ok('server started from the installed bin');

  fs.writeFileSync(
    path.join(dir, 'use-sdk.mjs'),
    `import { AgentWorldClient } from '@agent-world/sdk';
const world = new AgentWorldClient({ url: '${base}', project: 'consumer' });
const a = world.agent({ id: 'pkg-bot', name: 'Pkg Bot', kind: 'coding' });
await a.run('Verify the packages', (t) => { t.progress(0.5, 'Halfway', 'research'); });
await world.close();
const snap = await (await fetch('${base}/v1/projects/consumer/snapshot')).json();
console.log(JSON.stringify({ status: snap.state.agents['pkg-bot']?.stats, task: Object.values(snap.state.tasks)[0]?.status }));`,
  );
  const r = spawnSync(process.execPath, ['use-sdk.mjs'], { cwd: dir });
  const out = r.stdout.toString().trim();
  out.includes('"task":"completed"') && out.includes('"completed":1') ? ok(`SDK → server round trip: ${out}`) : fail(`SDK round trip failed: ${out} ${r.stderr}`);

  const html = await (await fetch(`${base}/`)).text();
  html.includes('<div id="root">') ? ok('console served at /') : fail('console not served');
  const glb = await fetch(`${base}/models/robot/RobotExpressive.glb`);
  glb.ok ? ok('3D models served with the console') : fail('models not served');

  // Claude Code bridge from the installed package, with a throwaway home dir
  const home = path.join(dir, 'home');
  const settingsFile = path.join(dir, 'claude-settings.json');
  const ci = spawnSync(process.execPath, [path.join(mod('server'), 'cli.js'), 'claude-install', '--file', settingsFile, '--world-project', 'consumer'], {
    cwd: dir,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  const hookArgs = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hooks?.PreToolUse?.[0]?.hooks?.[0]?.args : undefined;
  if (ci.status === 0 && hookArgs && hookArgs[0].startsWith(home.replace(/\\/g, '/')) && fs.existsSync(hookArgs[0])) {
    const hook = spawnSync(process.execPath, [...hookArgs], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'verify-session', cwd: dir }),
      env: { ...process.env, AGENT_WORLD_URL: base },
    });
    const snap = await (await fetch(`${base}/v1/projects/consumer/snapshot`)).json();
    hook.status === 0 && Object.keys(snap.state.agents).length > 1
      ? ok('claude-install: hooks copied to a stable dir and report to the server')
      : fail(`claude hook did not reach the server: ${hook.stderr}`);
  } else fail(`claude-install failed: ${ci.stdout}${ci.stderr}`);

  const core = spawnSync(process.execPath, ['-e', "import('@agent-world/core').then(m => console.log(typeof m.createAgentWorldStore))"], { cwd: dir });
  core.stdout.toString().includes('function') ? ok('core imports in plain Node') : fail(`core import failed ${core.stderr}`);
} finally {
  server.kill();
  await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
  if (process.exitCode) console.error(log);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(process.exitCode ? '\nFAILED' : '\nAll package checks passed.');
