// Publishes the built packages to npm, in dependency order.
//
//   npm run build:packages     (build + test the tarballs first: npm run verify:packages)
//   npm run publish:packages   (run in your own terminal: npm asks you to confirm with 2FA)
//
// Versions that are already on npm are skipped, so it is safe to re-run after a failure.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['protocol', 'core', 'sdk', 'engine', 'server'];
const shell = process.platform === 'win32';

for (const dir of ORDER) {
  const dist = path.join(root, 'packages', dir, 'dist');
  const manifest = path.join(dist, 'package.json');
  if (!fs.existsSync(manifest)) {
    console.error(`Missing ${manifest}. Run "npm run build:packages" first.`);
    process.exit(1);
  }
  const { name, version } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const exists = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { shell, encoding: 'utf8' });
  if (exists.status === 0 && exists.stdout.trim() === version) {
    console.log(`- ${name}@${version} is already published, skipping`);
    continue;
  }
  console.log(`\n▸ publishing ${name}@${version}`);
  const r = spawnSync('npm', ['publish', '--access', 'public'], { cwd: dist, stdio: 'inherit', shell });
  if (r.status !== 0) {
    console.error(`\nPublishing ${name} failed. Fix the problem above, then run this again.`);
    process.exit(1);
  }
}
console.log('\nAll packages are on npm. Try it: npx @agent-viz/server');
