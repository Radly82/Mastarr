const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { createFixture } = require('./fixtures');
let app, directory, origin, fixture;
const password = 'test-password-for-browser';
test.beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mastarr-browser-'));
  fixture = createFixture();
  app = await createApp({ configDir: directory, transport: fixture.transport });
  await app.store.addUser('admin', password, 'admin', true);
  app.store.set(
    'services',
    Object.fromEntries(
      ['sonarr', 'radarr', 'sabnzbd'].map((name) => [
        name,
        {
          url: `http://${name}:8080`,
          apiKey: 'test-only-browser-value',
          enabled: true,
          defaultQualityProfileId: 2,
          defaultRootFolder: name === 'sonarr' ? '/media/tv' : '/media/movies',
        },
      ]),
    ),
  );
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
});
test.afterEach(async () => {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
async function login(page, username = 'admin') {
  await page.goto(origin);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter your control room' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.goto(origin + '/#overview');
  await expect(page.locator('.hero')).toBeVisible();
}
test('desktop workflow: shared settings, library, detail, quality and monitoring', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page.getByRole('heading', { name: 'Your media, together.' })).toBeVisible();
  await page.locator('[data-nav="library"]').click();
  await expect(page.locator('.media-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'View Fixture Movie', exact: true }).click();
  const dialog = page.locator('#detail-dialog');
  await expect(dialog.getByRole('heading', { name: 'Fixture Movie', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Quality profile', exact: true }).selectOption('3');
  await dialog.getByLabel('Monitor for releases and upgrades').uncheck();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.movies[0].qualityProfileId).toBe(3);
  expect(fixture.movies[0].monitored).toBe(false);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  await otherPage.goto(origin + '/#settings');
  await expect(otherPage.locator('[data-service="radarr"] input[name="url"]')).toHaveValue(
    'http://radarr:8080',
  );
  await expect(otherPage.locator('[data-service="radarr"] input[name="apiKey"]')).toHaveValue('');
  const settingsResponse = await otherPage.request.get(origin + '/api/settings');
  expect(await settingsResponse.text()).not.toContain('test-only-browser-value');
  await other.close();
  expect(errors).toEqual([]);
});
test('search, add with explicit options, and protected manual release grab', async ({ page }) => {
  await login(page);
  await page.locator('[data-nav="discover"]').click();
  await page.getByLabel('Search movies and series', { exact: true }).fill('New');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'View A New Movie', exact: true }).click();
  await page
    .locator('#detail-dialog')
    .getByRole('combobox', { name: 'Quality profile', exact: true })
    .selectOption('3');
  await page
    .locator('#detail-dialog')
    .getByRole('button', { name: 'Add movie', exact: true })
    .click();
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  expect(fixture.movies.find((m) => m.tmdbId === 909).qualityProfileId).toBe(3);
  await page.goto(origin + '/#library');
  await page.getByRole('button', { name: 'View Fixture Movie', exact: true }).click();
  await page
    .locator('#detail-dialog')
    .getByRole('button', { name: 'Find releases', exact: true })
    .click();
  await expect(page.locator('.release-row')).toHaveCount(1);
  await page.locator('.release-row').getByRole('button', { name: 'Grab', exact: true }).click();
  await page
    .locator('#confirm-dialog')
    .getByRole('button', { name: 'Grab release', exact: true })
    .click();
  await expect(page.locator('.toast').last()).toContainText('Release sent');
  expect(
    fixture.calls.filter((c) => c.method === 'POST' && c.pathname === '/api/v3/release'),
  ).toHaveLength(1);
});
test('tabs and calendar preserve their selected state', async ({ page }) => {
  await login(page);
  await page.locator('[data-nav="activity"]').click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Completed movie', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Queue/ }).click();
  await expect(page.locator('.queue-row')).toHaveCount(1);
  await page.locator('[data-nav="calendar"]').click();
  await expect(page.locator('.calendar-row')).toHaveCount(2);
});
test('untrusted metadata is rendered as text, not executable markup', async ({ page }) => {
  fixture.movies[0].title = '<img src=x onerror="window.metadataExecuted=true">';
  fixture.movies[0].overview = '<svg onload="window.metadataExecuted=true">';
  fixture.movies[0].year = '<img src=x onerror="window.metadataExecuted=true">';
  fixture.movies[0].runtime = '<svg onload="window.metadataExecuted=true">';
  await login(page);
  expect(await page.evaluate(() => window.metadataExecuted)).toBeUndefined();
  await page.locator('[data-nav="library"]').click();
  expect(await page.locator('.media-card img[src="x"]').count()).toBe(0);
  await expect(page.locator('.media-title').filter({ hasText: '<img src=x' })).toBeVisible();
});
test('all main screens fit phone and tablet viewports; modal closes with Escape', async ({
  page,
}) => {
  await login(page);
  for (const width of [360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['overview', 'library', 'discover', 'activity', 'calendar', 'settings']) {
      await page.goto(origin + '/#' + route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('.skeleton')).toHaveCount(0);
      const size = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(size.viewport).toBe(width);
      expect(size.document, `${route} at ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/#library');
  await page.getByRole('button', { name: 'View Fixture Movie', exact: true }).click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  expect(
    await page.locator('#detail-dialog').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(390);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('#sidebar')).toBeInViewport();
});
test('first-run pairing creates the administrator and opens shared setup', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await app.close();
  const configDir = path.join(directory, 'unclaimed');
  app = await createApp({ configDir, transport: fixture.transport });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
  const token = fs.readFileSync(path.join(configDir, 'setup-token'), 'utf8');
  await page.goto(origin);
  await page.getByLabel('Pairing code').fill(token);
  await page.getByLabel('Username', { exact: true }).fill('new-admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your control room' }).click();
  await expect(page.locator('.connection-form')).toHaveCount(3);
  expect(app.store.hasUsers()).toBe(true);
  expect(fs.existsSync(path.join(configDir, 'setup-token'))).toBe(false);
  expect(consoleErrors).toEqual([]);
});
test('connection saves and loaded defaults remain server-side', async ({ page }) => {
  await login(page);
  await page.locator('[data-nav="settings"]').click();
  const form = page.locator('form[data-service="radarr"]');
  await form.locator('[name="apiKey"]').fill('test-only-replacement-key');
  await form.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(form.locator('.form-result')).toContainText('Connected');
  await form.getByRole('button', { name: 'Save connection' }).click();
  await expect(form.locator('.form-result')).toContainText('saved securely');
  await expect(form.locator('[name="apiKey"]')).toHaveValue('');
  await expect(form.getByText('Saved securely', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Enable Radarr')).toBeChecked();
  await page.reload();
  await expect(form.getByText('Saved securely', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Enable Radarr')).toBeChecked();
  await form.getByRole('button', { name: 'Load options' }).click();
  await form.locator('[name="defaultQualityProfileId"]').selectOption('3');
  await form.getByRole('button', { name: 'Save connection' }).click();
  await expect(form.locator('.form-result')).toContainText('saved securely');
  await form.getByLabel('Enable Radarr').uncheck();
  await expect(form.locator('.form-result')).toContainText('disabled');
  await page.reload();
  await expect(form.getByLabel('Enable Radarr')).not.toBeChecked();
  await form.getByLabel('Enable Radarr').check();
  await expect(form.locator('.form-result')).toContainText('enabled');
  await page.reload();
  await expect(form.getByLabel('Enable Radarr')).toBeChecked();
  expect(app.store.services().radarr.defaultQualityProfileId).toBe(3);
  expect(app.store.services().radarr.apiKey).toBe('test-only-replacement-key');
  expect(app.store.services().radarr.enabled).toBe(true);
});
test('bulk monitoring and import review submit the selected items only', async ({ page }) => {
  await login(page);
  await page.locator('[data-nav="library"]').click();
  await page.getByRole('button', { name: 'Select visible' }).click();
  await page.locator('.bulk-bar').getByRole('button', { name: 'Unmonitor', exact: true }).click();
  await page.locator('#confirm-dialog').getByRole('button', { name: 'Apply action' }).click();
  await expect(page.locator('.bulk-bar')).toHaveCount(0);
  expect(fixture.movies[0].monitored).toBe(false);
  expect(fixture.shows[0].monitored).toBe(false);
  await page.locator('[data-nav="activity"]').click();
  await page.getByRole('button', { name: 'Review import' }).click();
  await expect(page.locator('.import-file')).toContainText('fixture.mkv');
  await page.getByRole('button', { name: 'Import selected files' }).click();
  await page
    .locator('#confirm-dialog')
    .getByRole('button', { name: 'Import files', exact: true })
    .click();
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  expect(fixture.calls.filter((c) => c.body?.name === 'ManualImport')).toHaveLength(1);
});
test('cinema palette keeps amber actions and violet navigation in both themes', async ({
  page,
}, testInfo) => {
  await login(page);
  for (const [theme, navigation] of [
    ['dark', 'rgb(183, 160, 255)'],
    ['light', 'rgb(104, 70, 166)'],
  ]) {
    if (theme === 'light')
      await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      theme === 'dark' ? '#101018' : '#f5f2f8',
    );
    await expect(page.locator('.hero .primary')).toHaveCSS(
      'background-color',
      'rgb(255, 192, 109)',
    );
    await expect(page.locator('.hero .primary')).toHaveCSS('color', 'rgb(42, 27, 11)');
    await expect(page.locator('[data-nav="overview"]')).toHaveCSS('color', navigation);
    await page.screenshot({
      path: testInfo.outputPath(`cinema-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => innerWidth)).toBe(390);
  await expect(page.locator('#sidebar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -242, 0)');
  await page.screenshot({
    path: testInfo.outputPath('cinema-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
test('cinema shell replaces the old offline cache without caching API responses', async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(origin + '/healthz');
    await page.evaluate(async () => {
      const old = await caches.open('mastarr-shell-v2.0.4');
      await old.put('/styles.css', new Response('old palette'));
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(['mastarr-shell-v2.0.5']);
    const cached = await page.evaluate(async () => {
      const cache = await caches.open('mastarr-shell-v2.0.5');
      return {
        css: await (await cache.match('/styles.css')).text(),
        keys: (await cache.keys()).map((r) => new URL(r.url).pathname),
      };
    });
    expect(cached.css).toContain('--action-bg: #ffc06d');
    expect(cached.keys.some((key) => key.startsWith('/api/'))).toBe(false);
  } finally {
    await context.close();
  }
});
test('key screens meet automated WCAG accessibility checks in both themes', async ({ page }) => {
  await login(page);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const route of ['overview', 'library', 'discover', 'activity', 'calendar', 'settings']) {
      await page.evaluate((value) => {
        location.hash = value;
      }, route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('.skeleton')).toHaveCount(0);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        `${theme} ${route}`,
      ).toEqual([]);
    }
  }
});
test('viewer cannot change settings or submit media actions', async ({ page }) => {
  await app.store.addUser('viewer', password, 'viewer');
  await login(page, 'viewer');
  await page.locator('[data-nav="library"]').click();
  await expect(page.locator('[data-select]')).toHaveCount(0);
  await page.getByRole('button', { name: 'View Fixture Movie', exact: true }).click();
  await expect(
    page.locator('#detail-dialog').getByRole('button', { name: 'Save changes' }),
  ).toHaveCount(0);
  const session = await (await page.request.get(origin + '/api/auth/session')).json();
  const response = await page.request.post(origin + '/api/settings', {
    headers: { Origin: origin, 'X-CSRF-Token': session.csrf },
    data: { services: {} },
  });
  expect(response.status()).toBe(403);
});
