const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');

let app, origin, directory, cookie, csrf;
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mastarr-test-'));
  app = await createApp({ configDir: directory });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const post = (url, body, headers = {}) =>
  fetch(origin + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });

test('settings and library require a session, with no wildcard CORS', async () => {
  for (const route of ['/api/settings', '/api/library', '/api/activity']) {
    const res = await fetch(origin + route);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
});
test('only allowlisted public assets are served', async () => {
  for (const route of [
    '/server.js',
    '/.git/config',
    '/package.json',
    '/backend/store.js',
    '/config/mastarr.db',
    '/assets/js/index.js',
  ]) {
    assert.equal((await fetch(origin + route)).status, 404);
  }
  const res = await fetch(origin + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
});
test('setup requires the local pairing token and a strong password', async () => {
  assert.equal(
    (
      await post('/api/auth/setup', {
        username: 'admin',
        password: 'test-password-long',
        token: 'wrong',
      })
    ).status,
    403,
  );
  const token = fs.readFileSync(path.join(directory, 'setup-token'), 'utf8').trim();
  assert.equal(
    (await post('/api/auth/setup', { username: 'admin', password: 'short', token })).status,
    400,
  );
  const res = await post('/api/auth/setup', {
    username: 'admin',
    password: 'test-password-long',
    token,
  });
  assert.equal(res.status, 201);
  cookie = res.headers.get('set-cookie').split(';')[0];
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  assert.match(res.headers.get('set-cookie'), /SameSite=Strict/);
  const data = await res.json();
  csrf = data.csrf;
  assert.equal(data.user.role, 'admin');
  assert.equal(fs.existsSync(path.join(directory, 'setup-token')), false);
  assert.equal(
    (await post('/api/auth/setup', { username: 'other', password: 'test-password-long', token }))
      .status,
    409,
  );
});
test('cross-origin writes and missing CSRF tokens are rejected', async () => {
  assert.equal(
    (
      await post(
        '/api/settings',
        {},
        { Cookie: cookie, Origin: 'https://untrusted.invalid', 'X-CSRF-Token': csrf },
      )
    ).status,
    403,
  );
  assert.equal((await post('/api/settings', {}, { Cookie: cookie })).status, 403);
});
test('settings validation rejects metadata endpoints and malformed structures', async () => {
  const headers = { Cookie: cookie, 'X-CSRF-Token': csrf };
  for (const body of [
    null,
    [],
    { services: { sonarr: { url: 'http://169.254.169.254', apiKey: 'test-value' } } },
    { services: { sonarr: { url: 'http://user:pass@sonarr:8989', apiKey: 'test-value' } } },
  ]) {
    assert.equal((await post('/api/settings', body, headers)).status, 400);
  }
});
test('keys are encrypted at rest, masked in responses, and unchanged by blank updates', async () => {
  const key = 'test-only-service-credential';
  let res = await post(
    '/api/settings',
    { services: { sonarr: { url: 'http://sonarr:8989', apiKey: key, enabled: true } } },
    { Cookie: cookie, 'X-CSRF-Token': csrf },
  );
  assert.equal(res.status, 200);
  let data = await res.json();
  assert.equal(data.services.sonarr.hasApiKey, true);
  assert.equal(JSON.stringify(data).includes(key), false);
  const stored = app.store.db.prepare('SELECT value FROM settings WHERE id = ?').get('services');
  assert.equal(stored.value.includes(key), false);
  res = await post(
    '/api/settings',
    { services: { sonarr: { url: 'http://sonarr:8989', apiKey: '' } } },
    { Cookie: cookie, 'X-CSRF-Token': csrf },
  );
  assert.equal(res.status, 200);
  assert.equal(app.store.services().sonarr.apiKey, key);
  res = await fetch(origin + '/api/settings', { headers: { Cookie: cookie } });
  assert.equal(JSON.stringify(await res.json()).includes(key), false);
});
test('oversized requests are rejected', async () => {
  const res = await post(
    '/api/settings',
    { data: 'x'.repeat(300000) },
    { Cookie: cookie, 'X-CSRF-Token': csrf },
  );
  assert.equal(res.status, 413);
});
test('logout invalidates the persisted session', async () => {
  const res = await post('/api/auth/logout', {}, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(res.status, 200);
  assert.equal(
    (await fetch(origin + '/api/settings', { headers: { Cookie: cookie } })).status,
    401,
  );
});
