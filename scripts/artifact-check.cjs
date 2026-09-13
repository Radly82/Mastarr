const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const archive = path.join('dist', 'win-unpacked', 'resources', 'app.asar');
const files = asar
  .listPackage(archive)
  .map((file) => file.replace(/^[/\\]/, '').replaceAll('\\', '/'));
const allowed = new Set([
  'desktop',
  'desktop/connect.js',
  'desktop/icon.png',
  'desktop/index.html',
  'desktop/styles.css',
  'main.js',
  'preload.js',
  'package.json',
  'ma1.ico',
]);
const findings = [];
for (const file of files) {
  if (!allowed.has(file)) findings.push(`${file}: unexpected packaged path`);
  if (!/\.(js|json|css|html)$/.test(file)) continue;
  const text = asar.extractFile(archive, file).toString();
  if (/C:[/\\]+Users[/\\]+|[\w.+-]+@(?:gmail|outlook|hotmail)\./i.test(text))
    findings.push(`${file}: private metadata pattern [redacted]`);
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Packaged source privacy check passed for ${files.length} paths. Runtime libraries and compressed installers are not exhaustively certified by this check.`,
  );
