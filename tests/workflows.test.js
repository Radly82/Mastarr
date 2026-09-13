const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../server');
const { createFixture } = require('./fixtures');
let app, fixture, directory, origin, session, cookie;
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mastarr-workflows-'));
  fixture = createFixture();
  app = await createApp({ configDir: directory, transport: fixture.transport });
  const user = await app.store.addUser('test-admin', 'test-password-for-workflows', 'admin', true);
  session = app.store.newSession(user);
  cookie = `mastarr=${session.raw}`;
  app.store.set(
    'services',
    Object.fromEntries(
      ['sonarr', 'radarr', 'sabnzbd'].map((name) => [
        name,
        { enabled: true, url: `http://${name}:8080`, apiKey: 'test-only-workflow-key' },
      ]),
    ),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const get = (route) => fetch(origin + route, { headers: { Cookie: cookie } });
const post = (route, data, id = crypto.randomUUID()) =>
  fetch(origin + route, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.csrf,
      'X-Request-ID': id,
    },
    body: JSON.stringify(data),
  });

test('library, combined calendar and deduplicated activity', async () => {
  const library = await (await get('/api/library')).json();
  assert.equal(library.items.length, 2);
  const calendar = await (await get('/api/calendar')).json();
  assert.deepEqual(calendar.items.map((i) => i.service).sort(), ['radarr', 'sonarr']);
  const activity = await (await get('/api/activity')).json();
  assert.equal(activity.queue.length, 1);
  assert.equal(activity.queue[0].client.id, 'download-1');
});
test('one idempotency key yields exactly one upstream add', async () => {
  const id = crypto.randomUUID();
  const body = {
    externalId: 909,
    qualityProfileId: 3,
    rootFolderPath: '/media/movies',
    monitor: 'all',
    searchNow: true,
  };
  const first = await post('/api/media/radarr', body, id);
  assert.equal(first.status, 200);
  const second = await post('/api/media/radarr', body, id);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(
    fixture.calls.filter((c) => c.method === 'POST' && c.pathname === '/api/v3/movie').length,
    1,
  );
  assert.equal(fixture.movies.find((m) => m.tmdbId === 909).qualityProfileId, 3);
  assert.equal((await post('/api/media/radarr', { ...body, externalId: 777 }, id)).status, 409);
});
test('invalid bulk input is rejected before making any changes', async () => {
  const previous = fixture.calls.length;
  const response = await post('/api/bulk', {
    action: 'unmonitor',
    items: [
      { id: 1, service: 'radarr' },
      { id: 2, service: 'invalid' },
    ],
  });
  assert.equal(response.status, 400);
  assert.equal(fixture.calls.length, previous);
});
test('bulk actions apply per title and report outcomes', async () => {
  const response = await post('/api/bulk', {
    action: 'unmonitor',
    items: [
      { id: 1, service: 'radarr' },
      { id: 2, service: 'sonarr' },
    ],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.filter((r) => r.ok).length, 2);
  assert.equal(fixture.movies[0].monitored, false);
  assert.equal(fixture.shows[0].monitored, false);
});
test('episodes are checked against their owning series', async () => {
  assert.equal(
    (await post('/api/media/sonarr/999/episode', { episodeId: 12, monitored: false })).status,
    400,
  );
  assert.equal(
    (await post('/api/media/sonarr/2/episode', { episodeId: 12, monitored: false })).status,
    200,
  );
  assert.ok(
    fixture.calls.some((c) => c.pathname === '/api/v3/episode/monitor' && c.method === 'PUT'),
  );
});
test('manual import paths come from the engine, never from browser input', async () => {
  const candidates = await (await get('/api/queue/radarr/4/import')).json();
  assert.equal(candidates[0].filename, 'fixture.mkv');
  assert.equal(candidates[0].path, undefined);
  assert.equal((await post('/api/queue/radarr/4/import', { ids: [999] })).status, 400);
  assert.equal(
    (
      await post('/api/queue/radarr/4/import', {
        ids: [1],
        path: '/not/accepted',
        confirmRejected: false,
      })
    ).status,
    200,
  );
  const command = fixture.calls.find((c) => c.body?.name === 'ManualImport');
  assert.equal(command.body.files[0].path, '/downloads/fixture.mkv');
});
test('rejected releases require confirmation and are freshly validated', async () => {
  fixture.releases[0].rejected = true;
  fixture.releases[0].rejections = ['Quality below cutoff'];
  const body = { guid: fixture.releases[0].guid, indexerId: 1 };
  assert.equal((await post('/api/media/radarr/1/grab', body)).status, 400);
  assert.equal(
    (await post('/api/media/radarr/1/grab', { ...body, confirmRejected: true })).status,
    200,
  );
});
test('library removal requires confirmation and always retains files', async () => {
  assert.equal(
    (await post('/api/media/radarr/1/remove', { confirmation: 'wrong', keepFiles: true })).status,
    400,
  );
  assert.equal(
    (await post('/api/media/radarr/1/remove', { confirmation: 'Fixture Movie', keepFiles: false }))
      .status,
    400,
  );
  assert.equal(
    (await post('/api/media/radarr/1/remove', { confirmation: 'Fixture Movie', keepFiles: true }))
      .status,
    200,
  );
  assert.equal(
    fixture.movies.some((i) => i.id === 1),
    false,
  );
});
test('viewer read access does not permit writes or configuration reads', async () => {
  const viewer = await app.store.addUser('test-viewer', 'test-password-for-viewer', 'viewer');
  const token = app.store.newSession(viewer);
  assert.equal(
    (await fetch(origin + '/api/library', { headers: { Cookie: `mastarr=${token.raw}` } })).status,
    200,
  );
  assert.equal(
    (await fetch(origin + '/api/settings', { headers: { Cookie: `mastarr=${token.raw}` } })).status,
    403,
  );
  const response = await fetch(origin + '/api/media/sonarr/2/command', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: `mastarr=${token.raw}`,
      'X-CSRF-Token': token.csrf,
      'Content-Type': 'application/json',
      'X-Request-ID': crypto.randomUUID(),
    },
    body: JSON.stringify({ action: 'search' }),
  });
  assert.equal(response.status, 403);
});
