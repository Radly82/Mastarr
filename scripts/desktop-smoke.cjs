const { _electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mastarr-desktop-'));
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(profile);
  const app = await createApp({ configDir: path.join(directory, 'server'), demo: true });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const env = { ...process.env, MASTARR_DESKTOP_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MASTARR_SERVER_URL;
  let desktop;
  try {
    desktop = await _electron.launch({ args: [path.resolve('.')], env, timeout: 30000 });
    const page = await desktop.firstWindow();
    await page.getByLabel('Your Mastarr server').fill(origin);
    const preferences = await desktop.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        nodeIntegration: p.nodeIntegration,
        contextIsolation: p.contextIsolation,
        sandbox: p.sandbox,
      };
    });
    assert.deepEqual(preferences, {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    });
    await page.getByRole('button', { name: 'Open your control room' }).click();
    await page.waitForSelector('.hero');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const denied = await page.evaluate(() =>
      window.mastarrDesktop.connect('https://untrusted.invalid'),
    );
    assert.ok(denied.error);
    assert.equal(new URL(page.url()).origin, origin);
    await page.evaluate(() => window.open('https://untrusted.invalid'));
    assert.equal(
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'connection.json'), 'utf8'));
    assert.deepEqual(saved, { serverUrl: origin });
    console.log(
      'Desktop checks passed: connection screen, shared-server access, sandbox, context isolation, no renderer Node, denied remote IPC and popups, URL-only local preferences.',
    );
  } finally {
    if (desktop) await desktop.close();
    await app.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
