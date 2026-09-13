import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
];
const patterns = [
  ['personal email', /[\w.+-]+@(?:gmail|hotmail|outlook|yahoo)\.[a-z]+/i],
  ['developer home path', /C:[/\\]Users[/\\][^/\\\s]+/i],
  ['private network address', /\b(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    'provider credential',
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/,
  ],
];
let matches = 0;
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size > 2000000)
    continue;
  const data = fs.readFileSync(file);
  if (data.includes(0)) continue;
  for (const [index, line] of data.toString('utf8').split('\n').entries()) {
    for (const [label, pattern] of patterns)
      if (pattern.test(line)) {
        console.error(`${file}:${index + 1}: ${label} [value redacted]`);
        matches++;
      }
    const key =
      /(?:^|[\s{,])["']?(?:api[_-]?key|password|token|secret)["']?\s*[:=]\s*["']([\w./+=-]{16,})["']/i.exec(
        line,
      );
    if (key && !/^(?:test-|your-|example-|fixture-)/i.test(key[1])) {
      console.error(`${file}:${index + 1}: possible credential [value redacted]`);
      matches++;
    }
  }
}
console.log(
  `Privacy scan: ${files.length} paths checked, ${matches} findings. Binary artifacts require separate review.`,
);
if (matches) process.exitCode = 1;
