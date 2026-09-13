const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store, hash } = require('./backend/store');
const { Services, validateSettings, object, fail, names } = require('./backend/services');
const VERSION = '2.0.4';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const PUBLIC = new Set([
  '/',
  '/app.mjs',
  '/ui.mjs',
  '/views.mjs',
  '/styles.css',
  '/manifest.webmanifest',
  '/sw.mjs',
  '/assets/mark.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/landscape.svg',
  '/assets/poster.svg',
]);
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json'))
    throw fail('Use application/json for requests.', 415);
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [],
      exceeded = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 262144) {
        if (!exceeded) reject(fail('Request is too large.', 413));
        exceeded = true;
        chunks = [];
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('error', () => reject(fail('Request interrupted.')));
    req.on('end', () => {
      if (exceeded) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch {
        reject(fail('Invalid JSON.'));
      }
    });
  });
}
const positive = (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw fail('Invalid identifier.');
  return number;
};
function accountInput(body) {
  if (
    !object(body) ||
    typeof body.username !== 'string' ||
    !/^[a-zA-Z0-9_.-]{3,32}$/.test(body.username) ||
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    body.password.length > 256
  )
    throw fail('Use a 3–32 character username and a password of at least 12 characters.');
}

async function createApp(options = {}) {
  const configDir = options.configDir || process.env.CONFIG_DIR || path.join(__dirname, 'config');
  const secure = options.secureCookies ?? process.env.SECURE_COOKIES === 'true';
  const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : null;
  const demo = options.demo ?? process.env.DEMO_MODE === 'true';
  const store = new Store(configDir);
  const services = new Services(store, options.transport);
  const limits = new Map();
  let authBusy = 0;
  const rate = (key, maximum, windowMs) => {
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + windowMs };
      limits.set(key, entry);
    }
    if (++entry.count > maximum)
      throw fail('Too many requests. Please wait before trying again.', 429);
  };
  const cleanup = setInterval(() => {
    for (const [key, entry] of limits) if (entry.until < Date.now()) limits.delete(key);
  }, 60000);
  cleanup.unref();
  const cookieName = secure ? '__Host-mastarr' : 'mastarr';
  const setCookie = (res, value, age = 604800) =>
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`,
    );
  const demoData = () => require('./backend/demo').data();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.setHeader('Cache-Control', 'no-store');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route === '/healthz' && req.method === 'GET') {
        store.db.prepare('SELECT 1').get();
        return json(res, 200, { status: 'ok', version: VERSION });
      }
      if (!route.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw fail('Method not allowed.', 405);
        if (
          [
            '/index.html',
            '/modern.html',
            '/frosty.html',
            '/settings.html',
            '/layouts.html',
            '/about.html',
          ].includes(route)
        ) {
          res.writeHead(302, { Location: route === '/settings.html' ? '/#settings' : '/' });
          return res.end();
        }
        if (!PUBLIC.has(route)) throw fail('Not found.', 404);
        const file = path.join(__dirname, 'web', route === '/' ? 'index.html' : route);
        if (!fs.existsSync(file)) throw fail('Not found.', 404);
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
        if (route.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=3600');
        else res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') return res.end();
        return fs
          .createReadStream(file)
          .on('error', () => res.destroy())
          .pipe(res);
      }
      const unsafe = !['GET', 'HEAD'].includes(req.method);
      if (unsafe) {
        const origin = req.headers.origin;
        const expected =
          publicOrigin || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
        if (!origin || origin !== expected || req.headers['sec-fetch-site'] === 'cross-site')
          throw fail('Request origin is not allowed.', 403);
      }
      rate(`api:${req.socket.remoteAddress}`, 600, 60000);
      const raw = String(req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1);
      const session = demo
        ? { id: 'demo', username: 'Preview', role: 'viewer', csrf: 'demo' }
        : store.session(raw);
      if (route === '/api/auth/session' && req.method === 'GET')
        return json(res, 200, {
          setupRequired: !demo && !store.hasUsers(),
          user: session ? { id: session.id, username: session.username, role: session.role } : null,
          csrf: session?.csrf,
          demo,
          version: VERSION,
          secure,
        });
      if (route === '/api/auth/setup' || route === '/api/auth/login') {
        if (req.method !== 'POST') throw fail('Method not allowed.', 405);
        if (demo) throw fail('Preview mode is read-only.', 403);
        rate(`auth:${req.socket.remoteAddress}`, 12, 15 * 60000);
        if (authBusy >= 8) throw fail('Please wait before signing in again.', 429);
        const body = await readBody(req);
        if (route.endsWith('/setup')) {
          if (store.hasUsers()) throw fail('Setup is already complete.', 409);
          if (
            !object(body) ||
            typeof body.token !== 'string' ||
            hash(body.token.trim()) !== hash(fs.readFileSync(store.setupPath, 'utf8').trim())
          )
            throw fail('The pairing token is incorrect.', 403);
        }
        accountInput(body);
        authBusy++;
        let user;
        try {
          if (route.endsWith('/setup'))
            user = await store.addUser(body.username.toLowerCase(), body.password, 'admin', true);
          else {
            user = store.userByName(body.username.toLowerCase());
            if (!(await store.verifyPassword(body.password, user?.password)) || !user)
              throw fail('Incorrect username or password.', 401);
          }
        } finally {
          authBusy--;
        }
        const login = store.newSession(user);
        setCookie(res, login.raw);
        return json(res, route.endsWith('/setup') ? 201 : 200, {
          user: login.user,
          csrf: login.csrf,
        });
      }
      if (!session) throw fail('Sign in to continue.', 401);
      if (unsafe && (demo || req.headers['x-csrf-token'] !== session.csrf))
        throw fail(
          demo
            ? 'Preview mode is read-only. Connect your own instance to make changes.'
            : 'Invalid request token. Refresh and try again.',
          403,
        );
      const requireRole = (role) => {
        const levels = { viewer: 0, operator: 1, admin: 2 };
        if (levels[session.role] < levels[role])
          throw fail('Your account does not have permission for this action.', 403);
      };
      if (route === '/api/auth/logout' && req.method === 'POST') {
        store.logout(raw);
        setCookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      if (route === '/api/settings') {
        requireRole('admin');
        if (req.method === 'GET') return json(res, 200, store.publicSettings());
        if (req.method !== 'POST') throw fail('Method not allowed.', 405);
        const body = await readBody(req);
        const settings = validateSettings(body, store.services());
        store.set('services', settings);
        services.invalidate();
        store.event('settings', 'Updated service connections', session.username);
        return json(res, 200, store.publicSettings());
      }
      if (route === '/api/settings/import' && req.method === 'POST') {
        requireRole('admin');
        const body = await readBody(req);
        if (!object(body)) throw fail('Invalid settings file.');
        const input = { services: {} };
        for (const name of names)
          if (body[`${name}Url`])
            input.services[name] = {
              url: body[`${name}Url`],
              fallbackUrl: body[`${name}TailscaleUrl`] || '',
              apiKey: body[`${name}ApiKey`] || '',
              defaultRootFolder: body[`${name}DefaultRootFolder`] || '',
              enabled: true,
            };
        if (!Object.keys(input.services).length) throw fail('No legacy service connections found.');
        store.set('services', validateSettings(input, store.services()));
        services.invalidate();
        return json(res, 200, store.publicSettings());
      }
      if (route === '/api/users') {
        requireRole('admin');
        if (req.method === 'GET') return json(res, 200, { users: store.users() });
        if (req.method === 'POST') {
          const body = await readBody(req);
          accountInput(body);
          if (!['admin', 'operator', 'viewer'].includes(body.role)) throw fail('Invalid role.');
          return json(
            res,
            201,
            await store.addUser(body.username.toLowerCase(), body.password, body.role),
          );
        }
      }
      if (route === '/api/auth/password' && req.method === 'POST') {
        const body = await readBody(req);
        const user = store.userByName(session.username);
        if (
          !object(body) ||
          typeof body.currentPassword !== 'string' ||
          body.currentPassword.length > 256 ||
          !(await store.verifyPassword(body.currentPassword, user.password))
        )
          throw fail('Current password is incorrect.', 403);
        accountInput({ username: user.username, password: body.password });
        store.db
          .prepare('UPDATE users SET password = ? WHERE id = ?')
          .run(await store.passwordHash(body.password), user.id);
        store.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        setCookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      const testMatch = route.match(/^\/api\/connections\/(sonarr|radarr|sabnzbd)\/test$/);
      if (testMatch && req.method === 'POST') {
        requireRole('admin');
        const body = await readBody(req);
        const name = testMatch[1];
        const config = validateSettings({ services: { [name]: body } }, store.services())[name];
        const started = Date.now();
        const result = await services.call(
          name,
          name === 'sabnzbd' ? '/api?mode=version&output=json' : '/api/v3/system/status',
          'GET',
          undefined,
          config,
        );
        return json(res, 200, { ok: true, version: result.version, latency: Date.now() - started });
      }
      if (req.method === 'GET') {
        if (route === '/api/library')
          return json(res, 200, demo ? demoData().library : await services.library());
        if (route === '/api/search') {
          const query = url.searchParams.get('q')?.trim() || '';
          if (query.length < 2 || query.length > 150) throw fail('Search for 2–150 characters.');
          return json(
            res,
            200,
            demo
              ? {
                  items: demoData().library.items.filter((i) =>
                    `${i.title} ${i.genres.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
                  ),
                  errors: [],
                }
              : await services.search(query),
          );
        }
        if (route === '/api/health')
          return json(
            res,
            200,
            demo
              ? demoData().health
              : await services.cached('health', () => services.health(), 15000),
          );
        if (route === '/api/activity')
          return json(res, 200, demo ? demoData().activity : await services.activity());
        if (route === '/api/events')
          return json(res, 200, { events: demo ? demoData().events : store.events() });
        if (route === '/api/calendar') {
          const start = url.searchParams.get('start') || new Date().toISOString().slice(0, 10);
          const end =
            url.searchParams.get('end') ||
            new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
            !Number.isFinite(Date.parse(start)) ||
            !Number.isFinite(Date.parse(end)) ||
            Date.parse(end) < Date.parse(start) ||
            Date.parse(end) - Date.parse(start) > 62 * 86400000
          )
            throw fail('Choose a calendar range of up to 62 days.');
          return json(res, 200, demo ? demoData().calendar : await services.calendar(start, end));
        }
        const optionMatch = route.match(/^\/api\/options\/(sonarr|radarr)$/);
        if (optionMatch) {
          requireRole('operator');
          return json(res, 200, await services.options(optionMatch[1]));
        }
        const imageMatch = route.match(/^\/api\/art\/([a-f0-9]{64})$/);
        if (imageMatch) {
          const image = await services.image(imageMatch[1]);
          res.writeHead(200, {
            'Content-Type': image.type,
            'Cache-Control': 'private, max-age=86400',
          });
          return res.end(image.buffer);
        }
      }
      const importMatch = route.match(/^\/api\/queue\/(sonarr|radarr)\/(\d+)\/import$/);
      if (importMatch && req.method === 'GET') {
        requireRole('operator');
        return json(
          res,
          200,
          await services.importCandidates(importMatch[1], positive(importMatch[2])),
        );
      }
      const mediaMatch = route.match(
        /^\/api\/media\/(sonarr|radarr)\/(\d+)(?:\/(releases|command|grab|episode|remove))?$/,
      );
      if (mediaMatch && req.method === 'GET') {
        const [, name, rawId, sub] = mediaMatch;
        const id = positive(rawId);
        if (demo) {
          const item = demoData().library.items.find((m) => m.service === name && m.id === id);
          if (!item) throw fail('Title not found.', 404);
          return json(
            res,
            200,
            sub === 'releases' ? [] : { ...item, seasons: [], episodes: [], history: [] },
          );
        }
        if (sub === 'releases') {
          requireRole('operator');
          return json(
            res,
            200,
            await services.releases(
              name,
              id,
              url.searchParams.has('episodeId')
                ? positive(url.searchParams.get('episodeId'))
                : null,
            ),
          );
        }
        if (!sub) return json(res, 200, await services.detail(name, id));
      }
      const addMatch = route.match(/^\/api\/media\/(sonarr|radarr)$/);
      const queueMatch = route.match(
        /^\/api\/queue\/(sonarr|radarr|sabnzbd)\/([\w-]+)(?:\/(import))?$/,
      );
      if (
        req.method === 'POST' &&
        (mediaMatch || addMatch || queueMatch || route === '/api/bulk')
      ) {
        requireRole('operator');
        const body = await readBody(req);
        if (!object(body)) throw fail('An action object is required.');
        const requestId = req.headers['x-request-id'];
        if (!/^[\w-]{16,100}$/.test(requestId || ''))
          throw fail('An idempotent request identifier is required.');
        const operationId = `${session.id}:${requestId}`;
        const old = store.reserve(operationId, hash(route + JSON.stringify(body)));
        if (old) return json(res, old.status, old.body);
        let result;
        try {
          if (addMatch) result = await services.add(addMatch[1], body);
          else if (queueMatch) {
            if (queueMatch[3]) {
              if (queueMatch[1] === 'sabnzbd') throw fail('Use the media engine for imports.');
              result = await services.importFiles(queueMatch[1], positive(queueMatch[2]), body);
            } else result = await services.queueAction(queueMatch[1], queueMatch[2], body.action);
          } else if (mediaMatch) {
            const [, name, rawId, sub] = mediaMatch;
            const id = positive(rawId);
            if (sub === 'releases' || (sub === 'episode' && name !== 'sonarr'))
              throw fail('Method not allowed.', 405);
            if (sub === 'command') result = await services.command(name, id, body.action);
            else if (sub === 'grab') result = await services.grab(name, id, body);
            else if (sub === 'remove') result = await services.remove(name, id, body);
            else if (sub === 'episode') result = await services.monitorEpisode(id, body);
            else result = await services.update(name, id, body);
          } else {
            if (
              !Array.isArray(body.items) ||
              body.items.length < 1 ||
              body.items.length > 50 ||
              !['monitor', 'unmonitor', 'search', 'refresh', 'quality'].includes(body.action)
            )
              throw fail('Select up to 50 items and a valid bulk action.');
            for (const item of body.items) {
              if (!object(item) || !['sonarr', 'radarr'].includes(item.service))
                throw fail('Invalid bulk item.');
              positive(item.id);
            }
            if (
              body.action === 'quality' &&
              (!Number.isSafeInteger(body.qualityProfileId) || body.qualityProfileId < 1)
            )
              throw fail('Choose a quality profile.');
            result = { results: [] };
            for (const item of body.items) {
              const id = positive(item.id);
              try {
                const action = body.action;
                if (action === 'monitor' || action === 'unmonitor')
                  await services.update(item.service, id, { monitored: action === 'monitor' });
                else if (action === 'quality')
                  await services.update(item.service, id, {
                    qualityProfileId: body.qualityProfileId,
                  });
                else await services.command(item.service, id, action);
                result.results.push({ ...item, ok: true });
              } catch (error) {
                result.results.push({ service: item.service, id, ok: false, error: error.message });
              }
            }
          }
          store.event(
            body.action || (addMatch ? 'add' : 'update'),
            addMatch ? result.title : 'Library action submitted',
            session.username,
          );
          store.complete(operationId, { status: 200, body: result });
          return json(res, 200, result);
        } catch (error) {
          const response = {
            error: error.status
              ? error.message
              : 'The action could not be completed. Check Activity before retrying.',
          };
          store.complete(operationId, { status: error.status || 500, body: response });
          return json(res, error.status || 500, response);
        }
      }
      throw fail('Not found.', 404);
    } catch (error) {
      if (!res.headersSent)
        json(res, error.status || 500, {
          error: error.status
            ? error.message
            : 'An internal error occurred. Your credentials were not logged.',
        });
      else res.destroy();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  return {
    server,
    store,
    services,
    async close() {
      clearInterval(cleanup);
      const deadline = setTimeout(() => server.closeAllConnections(), 2000);
      deadline.unref();
      await new Promise((resolve) => server.close(resolve));
      clearTimeout(deadline);
      store.close();
    },
  };
}
if (require.main === module) {
  createApp()
    .then((app) => {
      app.server.listen(Number(process.env.PORT || 8686), process.env.HOST || '0.0.0.0', () => {
        console.log(`Mastarr ${VERSION} is ready on port ${app.server.address().port}.`);
        if (!app.store.hasUsers()) {
          let code = '';
          try { code = fs.readFileSync(app.store.setupPath, 'utf8').trim(); } catch {}
          if (code) {
            console.log('');
            console.log('═══════════════════════════════════════════════════════');
            console.log('  FIRST-RUN SETUP');
            console.log('');
            console.log(`  Your pairing code is:  ${code}`);
            console.log('');
            console.log('  1. Open Mastarr in your browser.');
            console.log('  2. Enter this code on the setup screen.');
            console.log('  3. Choose your admin username and password.');
            console.log('═══════════════════════════════════════════════════════');
            console.log('');
          }
        }
      });
      let stopping = false;
      for (const signal of ['SIGINT', 'SIGTERM'])
        process.on(signal, async () => {
          if (stopping) return;
          stopping = true;
          await app.close();
          process.exit(0);
        });
    })
    .catch(() => {
      console.error(
        'Mastarr could not open its configuration. Check volume permissions and restore the complete backup if needed.',
      );
      process.exitCode = 1;
    });
}
module.exports = { createApp, VERSION };
