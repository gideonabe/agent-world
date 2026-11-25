// Builds publish-ready npm packages into packages/<name>/dist and packs them into ./release.
//
//   npm run build:packages            build + pack everything
//   npm run build:packages -- --no-pack
//
// Workspaces keep importing TypeScript source during development; only dist/ is published
// (each dist/ has its own package.json pointing at compiled JS + .d.ts).
import { build } from 'esbuild';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = !process.argv.includes('--no-pack');
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Build order matters only for packing; each build is independent. */
const PACKAGES = [
  { dir: 'protocol', entries: { index: 'src/index.ts' }, platform: 'neutral' },
  { dir: 'core', entries: { index: 'src/index.ts' }, platform: 'neutral' },
  { dir: 'sdk', entries: { index: 'src/index.ts' }, platform: 'neutral' },
  {
    dir: 'engine',
    entries: { index: 'src/index.ts', presets: 'src/presets/index.ts' },
    platform: 'browser',
    assets: true,
  },
  {
    dir: 'server',
    entries: { index: 'src/index.ts', cli: 'src/cli.ts' },
    platform: 'node',
    // world presets are plain data: inline them so the server doesn't pull in React/three
    inline: ['@agent-viz/engine'],
    bin: { 'agent-world-server': './cli.js' },
    dashboard: true,
    // the Claude Code bridge, run with `agent-world-server claude-install`
    claudeCode: true,
  },
];

const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};

const version = (name) => JSON.parse(fs.readFileSync(path.join(root, 'packages', name.replace('@agent-viz/', ''), 'package.json'), 'utf8')).version;

/** Workspace "0.1.0" deps become "^0.1.0" ranges in the published manifest. */
function publishedDeps(deps = {}, drop = []) {
  const out = {};
  for (const [name, range] of Object.entries(deps)) {
    if (drop.includes(name)) continue;
    out[name] = name.startsWith('@agent-viz/') ? `^${version(name)}` : range;
  }
  return Object.keys(out).length ? out : undefined;
}

if (process.argv.includes('--dashboard') || PACKAGES.some((p) => p.dashboard)) {
  console.log('\n▸ building dashboard');
  run('npm', ['run', 'build', '-w', '@agent-viz/dashboard']);
}

const releaseDir = path.join(root, 'release');
if (pack) fs.rmSync(releaseDir, { recursive: true, force: true }), fs.mkdirSync(releaseDir, { recursive: true });

for (const p of PACKAGES) {
  const pkgDir = path.join(root, 'packages', p.dir);
  const dist = path.join(pkgDir, 'dist');
  const src = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  console.log(`\n▸ ${src.name}`);
  fs.rmSync(dist, { recursive: true, force: true });

  // 1) JavaScript (ESM). Dependencies stay external; only our own code is bundled.
  const deps = [...Object.keys(src.dependencies ?? {}), ...Object.keys(src.peerDependencies ?? {})].filter((d) => !(p.inline ?? []).includes(d));
  await build({
    entryPoints: Object.fromEntries(Object.entries(p.entries).map(([k, v]) => [k, path.join(pkgDir, v)])),
    outdir: dist,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: p.platform,
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: true,
    legalComments: 'none',
    external: deps.flatMap((d) => [d, `${d}/*`]),
    mainFields: ['module', 'main'],
    logLevel: 'warning',
  });

  // 2) Type declarations
  const tsconfig = path.join(pkgDir, 'tsconfig.build.json');
  fs.writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: 'dist/types', rootDir: 'src', types: ['node', 'vite/client'] },
      include: ['src'],
    }),
  );
  try {
    run('npx', ['tsc', '-p', tsconfig]);
  } finally {
    fs.rmSync(tsconfig, { force: true });
  }

  // 3) Extras
  if (p.assets) fs.cpSync(path.join(pkgDir, 'assets'), path.join(dist, 'assets'), { recursive: true });
  if (p.claudeCode) {
    fs.mkdirSync(path.join(dist, 'claude-code'), { recursive: true });
    for (const f of ['install.mjs', 'agent-world-hook.mjs', 'mapping.mjs', 'README.md'])
      fs.copyFileSync(path.join(root, 'integrations', 'claude-code', f), path.join(dist, 'claude-code', f));
  }
  if (p.dashboard) fs.cpSync(path.join(root, 'apps', 'dashboard', 'dist'), path.join(dist, 'dashboard'), { recursive: true });
  for (const f of ['README.md']) if (fs.existsSync(path.join(pkgDir, f))) fs.copyFileSync(path.join(pkgDir, f), path.join(dist, f));
  fs.copyFileSync(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
  if (p.bin) {
    const cli = path.join(dist, 'cli.js');
    const code = fs.readFileSync(cli, 'utf8');
    if (!code.startsWith('#!')) fs.writeFileSync(cli, `#!/usr/bin/env node\n${code}`);
  }

  // 4) Publish manifest
  const exportsMap = Object.fromEntries(
    Object.keys(p.entries)
      .filter((k) => k !== 'cli')
      .map((k) => [k === 'index' ? '.' : `./${k}`, { types: `./types/${k === 'index' ? 'index' : `${k}/index`}.d.ts`, import: `./${k}.js` }]),
  );
  if (p.assets) exportsMap['./assets/*'] = './assets/*';
  const manifest = {
    name: src.name,
    version: src.version,
    description: src.description,
    license: src.license,
    repository: src.repository,
    type: 'module',
    main: './index.js',
    types: './types/index.d.ts',
    exports: exportsMap,
    ...(p.bin ? { bin: p.bin } : {}),
    sideEffects: false,
    engines: { node: rootPkg.engines?.node ?? '>=20' },
    ...(publishedDeps(src.dependencies, p.inline) ? { dependencies: publishedDeps(src.dependencies, p.inline) } : {}),
    ...(src.peerDependencies ? { peerDependencies: src.peerDependencies } : {}),
  };
  fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  // 5) Pack
  if (pack) {
    const out = execFileSync('npm', ['pack', '--pack-destination', releaseDir, '--json'], { cwd: dist, shell: process.platform === 'win32' }).toString();
    const info = JSON.parse(out.slice(out.indexOf('[')))[0];
    console.log(`  packed ${info.filename}  (${(info.size / 1024).toFixed(0)} kB, ${info.entryCount} files)`);
  }
}
console.log(pack ? `\nTarballs in ${releaseDir}` : '\nBuilt dist/ folders');
