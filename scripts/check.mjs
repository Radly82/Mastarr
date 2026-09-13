import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = ['server.js', 'main.js', 'preload.js', 'playwright.config.js'];
for (const folder of ['backend', 'web', 'desktop', 'scripts', 'tests']) {
  for (const entry of fs.readdirSync(folder, { recursive: true })) {
    const file = path.join(folder, entry);
    if (fs.statSync(file).isFile() && /\.(mjs|cjs|js)$/.test(file)) files.push(file);
  }
}
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr);
    failed = true;
  }
}
for (const file of ['package.json', 'package-lock.json', 'web/manifest.webmanifest'])
  JSON.parse(fs.readFileSync(file, 'utf8'));
const main = fs.readFileSync('main.js', 'utf8');
if (
  !main.includes('contextIsolation: true') ||
  !main.includes('nodeIntegration: false') ||
  !main.includes('sandbox: true')
) {
  console.error('Electron safety settings are missing.');
  failed = true;
}
for (const file of files.filter((f) => f.startsWith('web'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (/localStorage\.(?:getItem|setItem)\(['"]appSettings/.test(source)) {
    console.error(`Legacy credential storage found: ${file}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log(`Syntax and security invariants passed for ${files.length} source files.`);
