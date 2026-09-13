const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Services, serviceUrl, blockedAddress, request } = require('../backend/services');
const store = {
  services: () => ({
    radarr: {
      enabled: true,
      url: 'http://primary:7878',
      fallbackUrl: 'http://secondary:7878',
      apiKey: 'test-only-value',
    },
  }),
};
test('numeric metadata cannot become executable HTML fields', () => {
  const service = new Services(store);
  const media = service.media('radarr', {
    id: '<img src=x>',
    tmdbId: '<svg>',
    title: 'Safe title',
    year: '<img src=x>',
    runtime: '<svg>',
    qualityProfileId: '<img>',
    sizeOnDisk: Infinity,
  });
  assert.equal(media.id, null);
  assert.equal(media.externalId, 0);
  assert.equal(media.year, null);
  assert.equal(media.runtime, 0);
  assert.equal(media.qualityProfileId, 0);
  assert.equal(media.size, 0);
});
test('reads fail over sequentially without letting a fast failed response win', async () => {
  const calls = [];
  const service = new Services(store, async (url) => {
    calls.push(url);
    if (url.includes('primary')) throw new Error('HTTP 401');
    return { ok: true };
  });
  assert.deepEqual(await service.call('radarr', '/api/v3/movie'), { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /primary/);
  assert.match(calls[1], /secondary/);
});
test('writes never race endpoints or retry after an uncertain response', async () => {
  const calls = [];
  const service = new Services(store, async (url, options) => {
    calls.push({ url, options });
    throw new Error('timeout');
  });
  await assert.rejects(service.call('radarr', '/api/v3/movie', 'POST', { title: 'Test' }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['X-Api-Key'], 'test-only-value');
  assert.equal(calls[0].url.includes('test-only-value'), false);
});
test('concurrent reads share one in-flight request', async () => {
  let calls = 0;
  const service = new Services(store, async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return [];
  });
  await Promise.all([service.library(), service.library(), service.library()]);
  assert.equal(calls, 1);
});
test('unsafe service URLs and image destinations are rejected', () => {
  for (const input of [
    'file:///etc/passwd',
    'http://user:pass@example.com',
    'http://169.254.169.254',
    'http://[::ffff:169.254.169.254]',
    'http://example.com?token=x',
  ])
    assert.throws(() => serviceUrl(input));
  assert.equal(blockedAddress('fe80::1'), true);
  assert.equal(blockedAddress('100.100.100.200'), true);
  const service = new Services(store);
  assert.equal(service.art('radarr', { url: 'https://arbitrary.invalid/poster.jpg' }), '');
  assert.equal(service.art('radarr', { url: '/MediaCover/../../settings.json' }), '');
  assert.equal(service.art('radarr', { url: 'javascript:alert(1)' }), '');
});
test('redirects are not followed and credentials do not reach another origin', async () => {
  const http = require('node:http');
  let destinationCalls = 0;
  const destination = http.createServer((req, res) => {
    destinationCalls++;
    res.end('{}');
  });
  await new Promise((resolve) => destination.listen(0, '127.0.0.1', resolve));
  const redirector = http.createServer((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${destination.address().port}` });
    res.end();
  });
  await new Promise((resolve) => redirector.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(
      request(`http://127.0.0.1:${redirector.address().port}`, {
        headers: { 'X-Api-Key': 'test-only-value' },
      }),
    );
    assert.equal(destinationCalls, 0);
  } finally {
    await Promise.all([
      new Promise((r) => destination.close(r)),
      new Promise((r) => redirector.close(r)),
    ]);
  }
});
