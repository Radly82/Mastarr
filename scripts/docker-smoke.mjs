import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const image = process.argv[2] || 'mastarr:2.0.0';
const name = `mastarr-test-${randomUUID().slice(0, 8)}`;
const volume = `${name}-config`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let created = false,
  volumeCreated = false;
try {
  docker('volume', 'create', '--label', 'mastarr.test=true', volume);
  volumeCreated = true;
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=32m',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '-p',
    '127.0.0.1::8686',
    '-v',
    `${volume}:/config`,
    image,
  );
  created = true;
  const port = docker(
    'inspect',
    '--format',
    '{{ (index (index .NetworkSettings.Ports "8686/tcp") 0).HostPort }}',
    name,
  );
  let origin = `http://127.0.0.1:${port}`;
  const ready = async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(origin + '/healthz')).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Container did not become ready.');
  };
  await ready();
  assert.notEqual(docker('exec', name, 'id', '-u'), '0');
  assert.equal((await fetch(origin + '/api/settings')).status, 401);
  assert.equal((await fetch(origin + '/server.js')).status, 404);
  const setupToken = docker(
    'exec',
    name,
    'node',
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/config/setup-token','utf8'))",
  );
  const setup = await fetch(origin + '/api/auth/setup', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: setupToken,
      username: 'smoke-admin',
      password: 'test-only-smoke-password',
    }),
  });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const session = await setup.json();
  const saved = await fetch(origin + '/api/settings', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.csrf,
    },
    body: JSON.stringify({
      services: {
        sonarr: { enabled: false, url: 'http://sonarr:8989', apiKey: 'test-only-smoke-key' },
      },
    }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.text()).includes('test-only-smoke-key'), false);
  docker('restart', name);
  const restartedPort = docker(
    'inspect',
    '--format',
    '{{ (index (index .NetworkSettings.Ports "8686/tcp") 0).HostPort }}',
    name,
  );
  origin = `http://127.0.0.1:${restartedPort}`;
  await ready();
  const persisted = await (
    await fetch(origin + '/api/settings', { headers: { Cookie: cookie } })
  ).json();
  assert.equal(persisted.services.sonarr.hasApiKey, true);
  assert.equal((await (await fetch(origin + '/api/auth/session')).json()).setupRequired, false);
  assert.equal(
    docker(
      'exec',
      name,
      'node',
      '-e',
      "process.stdout.write(String((require('node:fs').statSync('/config/encryption.key').mode & 0o777) === 0o600))",
    ),
    'true',
  );
  const paths = docker(
    'exec',
    name,
    'node',
    '-e',
    "process.stdout.write(require('node:fs').readdirSync('/app').sort().join(','))",
  );
  assert.equal(paths, 'backend,package.json,server.js,web');
  console.log(
    'Docker checks passed: non-root, read-only root, narrow image contents, authentication, protected keys, persistent configuration and sessions after restart.',
  );
} finally {
  if (created) docker('rm', '-f', name);
  if (volumeCreated) docker('volume', 'rm', volume);
}
