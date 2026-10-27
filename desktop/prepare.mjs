// Builds the web app and copies what the desktop app needs into ./app (the web files and the library server).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n"${cmd} ${args.join(' ')}" failed.`); process.exit(1); }
};
if (!fs.existsSync(path.join(root, 'node_modules'))) run('npm', ['install'], root);
run('npm', ['run', 'build'], root);
const app = path.join(here, 'bundle');
fs.rmSync(app, { recursive: true, force: true });
fs.mkdirSync(app, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(app, 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'tools', 'serve.mjs'), path.join(app, 'serve.mjs'));
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ type: 'module' }));
console.log('\nDesktop files ready in desktop/bundle');
