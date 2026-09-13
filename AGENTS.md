# Mastarr — guide for coding assistants

Read this first when working in this repository. This describes the implemented architecture, not a proposed rewrite. Reviewed against the 2.0.3 codebase; verify current code and versions before making changes. Use [README.md](README.md) for user-facing installation instructions. Scope work to this Git root; do not apply unrelated sibling projects' architecture, scripts or release procedures to Mastarr.

## 1. Product and boundaries

Mastarr is a self-hosted movie/series management UI, primarily deployed as one Docker container on Unraid. Users configure service connections once on the server. Other browsers, phones and desktop clients sign in to that same instance; they do not each configure media-service API keys.

- **Sonarr** owns series/episodes, monitoring, indexer searches, release selection and TV imports.
- **Radarr** owns movies, monitoring, indexer searches, release selection and movie imports.
- **SABnzbd** is the directly supported download client for queue/history and pause/resume/retry controls. Engine queues can also reflect other clients configured in Sonarr/Radarr.
- **Mastarr** owns its accounts, shared connection settings, UI, service adapters, short-lived caches and an action log. It does not own the engines' media databases or manipulate library files directly.
- `compose.stack.yml` optionally deploys the engines alongside Mastarr. This is a multi-service deployment, not an implementation of replacement automation engines.
- **Native transcoding was explicitly shelved by the owner.** There is no transcoding worker or FFmpeg/HandBrake integration. Do not implement, bundle or describe these as existing features unless the owner reopens the request.
- The mobile client is the responsive web/PWA shell. A separate native Android package is not maintained by this release.

## 2. Architecture at a glance

```text
Browser / mobile PWA                  Electron desktop client
  web/index.html                        main.js + preload.js
  web/app.mjs                            desktop/ connection screen
        |                                     |
        +---------- same Mastarr origin ------+
                           |
                      server.js
             allowlisted static files + /api/*
            authentication / roles / CSRF / validation
                    /                 \
        backend/store.js          backend/services.js
        SQLite + encryption       predefined service operations
        accounts / sessions       caches / normalization / artwork
        operation deduplication               |
                                  Sonarr / Radarr / SABnzbd
```

Runtime is **Node.js 24**, including built-in `node:sqlite`, HTTP, crypto and filesystem modules. There are currently no third-party npm production dependencies. Backend and Electron code use CommonJS; browser modules use native ESM (`.mjs`). There is no React, Express, Vite, TypeScript compilation or frontend bundling step. Do not assume those frameworks are installed.

**Important entry-point distinction:** `npm start` runs `server.js`. `package.json` names `main.js` because it is Electron's entry point, not because it is the HTTP server.

## 3. File map and where to make changes

| Location | Responsibility |
| --- | --- |
| [server.js](server.js) | HTTP startup, `createApp()`, route dispatch, public asset allowlist, security headers, auth/role/CSRF checks, input validation and mutation deduplication. |
| [backend/store.js](backend/store.js) | `Store`: SQLite schema, encrypted settings, scrypt passwords, sessions, bounded events and operation records. |
| [backend/services.js](backend/services.js) | `Services`: upstream HTTP transport, URL validation, caches, media normalization and all supported engine/client operations. |
| [backend/demo.js](backend/demo.js) | Explicitly synthetic data for read-only preview mode. Never use as a fallback for a failed production connection. |
| [web/index.html](web/index.html) | HTML shell, module/CSS entry points, native dialogs, toast live region and PWA links. |
| [web/app.mjs](web/app.mjs) | Client state, `api()`, boot/login, hash navigation, refresh/search, event delegation, forms and action handlers. |
| [web/views.mjs](web/views.mjs) | HTML-rendering functions for overview, library/discovery, activity, calendar, settings, media details and releases. |
| [web/ui.mjs](web/ui.mjs) | Escaping, safe artwork URLs, icons, formatting, badges, loading/empty states, toasts and confirmation dialogs. |
| [web/styles.css](web/styles.css) | Shared theme tokens, components, responsive layouts, focus states and reduced-motion behavior. |
| [web/sw.mjs](web/sw.mjs) | Network-first application-shell caching with an explicit asset list. Never caches API responses. |
| [web/manifest.webmanifest](web/manifest.webmanifest), `web/assets/` | PWA metadata, icons and original fallback/demo artwork. Real library artwork comes through the server proxy. |
| [main.js](main.js), [preload.js](preload.js), `desktop/` | Sandboxed Electron client and its local server-connection screen. |
| [Dockerfile](Dockerfile), [.dockerignore](.dockerignore) | Minimal production image, Node runtime, non-root user and explicit build-context allowlist. |
| [docker-compose.yml](docker-compose.yml), [compose.stack.yml](compose.stack.yml), [mastarr.xml](mastarr.xml) | Standalone Compose deployment, optional engine stack and Unraid template. |
| `tests/`, `scripts/`, `.github/workflows/` | Fixtures, verification, packaging and explicit release automation; details below. |
| `legacy/` | Historical layouts and launchers retained for reference only. Not served or packaged. Do not fix these expecting the production UI to change. |

## 4. How requests and media actions flow

### Startup and sign-in

1. `createApp(options)` creates a `Store` and `Services`. It returns `{ server, store, services, close }`; callers bind the server themselves. The executable entry point binds the configured host/port and handles shutdown.
2. `Store` opens its database and encryption key. With no accounts, it creates a restricted `setup-token` file.
3. Browser `boot()` calls `GET /api/auth/session`. An unclaimed instance shows pairing/account creation; otherwise an unauthenticated client sees sign-in.
4. Setup requires the one-time token plus a valid username/password. Successful setup removes the token file. Login creates a persisted session.
5. The session token is in an HttpOnly cookie. The CSRF token and limited user information are returned to the UI. Authenticated boot renders the shell and fetches library, health, activity, calendar and events.

### Search -> add -> download -> import

1. A user searches through `web/app.mjs` -> `GET /api/search?q=...` -> `Services.search()`.
2. `Services` queries the Sonarr/Radarr v3 lookup APIs and merges results with known library entries. A new lookup result has no internal library `id`.
3. The details dialog loads valid root folders and quality profiles through `/api/options/:service`.
4. Adding submits to `POST /api/media/:service`. The backend resolves the external ID again, checks duplicates and validates selected options before calling the engine.
5. Sonarr/Radarr perform their search/download workflow using **their configured indexers and download clients**. Mastarr's add/search operation does not directly send a media download to SABnzbd.
6. The configured client (normally SABnzbd in this setup) downloads; the engines import. Mastarr polls their APIs and displays the resulting state. An accepted command means queued/accepted, not that the download or import has finished.

### Other mutations

Frontend actions use confirmations where appropriate and send requests through `api()`. The server checks roles and CSRF, reserves an operation ID, invokes a specific `Services` method, logs a short action and records the result.

- Bulk operations accept at most 50 titles and report per-item outcomes. They are not a transaction across engines.
- Release grabs re-fetch available releases and require confirmation for rejected releases. Series release searches select an episode and verify its owning series.
- Import candidates come from the engine's tracked download. Browser-selected candidate IDs are revalidated; filesystem paths in an import command come from the engine, not arbitrary browser input.
- Removal requires the current title confirmation and `keepFiles: true`; the upstream delete explicitly preserves media files.

### IDs and normalized data

`Services.media()` produces the common frontend shape. Its `service` is `sonarr` or `radarr`; its UI `type` is `series` or `movie`. `id` is the engine's internal library ID, while `externalId` is TVDB for series or TMDB for movies. They are not interchangeable. Frontend `mediaKey()` namespaces identities by service and uses the external ID when available.

Normalize numeric metadata before rendering, and escape textual metadata. Do not return entire raw upstream objects to simplify a new screen: they may include paths, internal fields or unsafe content.

## 5. HTTP API navigation

Read `server.js` for precise schemas and method checks. These are Mastarr routes, distinct from the upstream `/api/v3/*` endpoints inside `Services`.

| Routes | Access / purpose |
| --- | --- |
| `GET /healthz`, `GET /api/auth/session` | Public health/readiness and boot/session information. |
| `POST /api/auth/setup`, `/api/auth/login` | Pairing/login with origin validation and throttling; run before the authenticated CSRF gate. |
| `POST /api/auth/logout`, `/api/auth/password` | Authenticated account operations. Password changes invalidate the user's sessions. |
| `GET /api/library`, `/api/search`, `/api/health`, `/api/activity`, `/api/events`, `/api/calendar` | Authenticated reads; viewers can browse. |
| `GET /api/media/:service/:id`, `/api/art/:key` | Authenticated details and registered/proxied artwork. |
| `GET /api/options/:service`, `/api/media/:service/:id/releases`, `/api/queue/:service/:id/import` | Operator/admin option, release and import reads. |
| `GET/POST /api/settings`, `POST /api/settings/import`, `POST /api/connections/:service/test`, `GET/POST /api/users` | Admin-only shared configuration and account management. |
| `POST /api/media/:service` | Operator/admin add using an external media ID. |
| `POST /api/media/:service/:id` and `/command`, `/grab`, `/episode`, `/remove` suffixes | Operator/admin updates and named actions; episode monitoring is Sonarr-only. |
| `POST /api/queue/:service/:id`, `/api/queue/:service/:id/import`, `/api/bulk` | Operator/admin queue actions, engine imports and batch operations. |

Authenticated mutations require a matching Origin and `X-CSRF-Token`. Payload-reading routes use `readBody()` to enforce JSON and a 256 KiB limit; logout does not need a payload. Media/queue/bulk mutations additionally require `X-Request-ID`. UI visibility is not authorization; preserve server-side checks on every new route.

## 6. Persistence, caches and concurrency

Configuration directory: `CONFIG_DIR`, falling back to repository-local `config/` for source runs; the image sets `/config`.

| Data | Implementation |
| --- | --- |
| `mastarr.db` | SQLite in WAL mode; schema initialized in `Store`, currently `user_version=1`. There is no separate migrations framework. |
| `encryption.key` | 32-byte key for AES-256-GCM encrypted `settings` values. Must be retained with database backups. |
| `settings` table | Encrypted JSON records, including the shared `services` record. `publicSettings()` excludes key values and exposes `hasApiKey`. Blank API-key updates retain the saved value. |
| `users` table | Usernames, roles and salted scrypt password hashes. |
| `sessions` table | SHA-256 session-token hashes, user references, CSRF values and expiration. Current sessions last seven days. |
| `events` table | Short action entries; bounded to 500 stored, with 30 returned by the current endpoint. Not a complete download history or a durable job queue. |
| `operations` table | Per-user idempotency records: request digest, saved response and creation time. Entries older than 24 hours are pruned when reserving operations. |

Missing encryption keys with an existing database cause startup to fail rather than silently reset data. Encryption does not protect against an attacker who obtains both the database and key. Back up the complete configuration directory while stopped. Add deliberate migrations and backward-compatibility tests for schema changes; do not reset users' databases.

`Services.cached()` shares in-flight reads and keeps bounded in-memory caches. Typical TTLs: library/health 15 seconds, activity 5 seconds, options/search/calendar 60 seconds. These and the artwork registry/preferred service addresses are process-local, not persisted media storage.

`Services.call()` tries read endpoints sequentially and remembers a working address. Writes are sent once, not raced across primary/fallback URLs. SABnzbd's mutating GET operations are deliberately sent through a single transport call too. Preserve that special handling.

Idempotency covers the same user/request ID and route/body digest. Reusing an ID for a different request is rejected. A reserved operation with no result is reported as running/unknown, not automatically replayed. Do not add blind retries after an ambiguous upstream write timeout.

## 7. Frontend conventions and safe extension points

- Hash routes: `#overview`, `#library`, `#discover`, `#activity`, `#calendar`, `#settings`.
- `web/app.mjs` owns client state and actions. `web/views.mjs` renders templates; `web/ui.mjs` supplies shared helpers.
- Event delegation uses `data-action`, `data-form`, `data-filter` and `data-select`. Extend the corresponding handler, not inline `onclick` attributes.
- Always escape provider/user text with `escape` (normally imported as `e`). Use `safeImage()` and registered artwork routes instead of arbitrary image URLs.
- Preserve `searchVersion`/`detailVersion` guards against stale async results, the refresh-in-flight guard, form busy state and native dialog behavior.
- Refresh uses a 15-second timer, skips hidden pages and resumes on visibility/online events. It does not use WebSockets or server-sent events.
- `localStorage` holds display preferences only: theme, view and saved filters. Never put shared service settings, API keys or session tokens there.
- Maintain shared CSS tokens, both themes, narrow-screen layouts, accessible names, visible focus and reduced-motion behavior. Reuse components instead of adding another standalone layout page.
- The current visual direction is a cinema palette: midnight/charcoal surfaces, amber primary actions, violet navigation and blue positive states. `--action-*` controls button fills independently of accessible `--accent` text colors in light/dark themes. Keep web, desktop, PWA icons and fallback artwork consistent; do not restore the previous lime-green branding.
- New browser files must be added to `server.js`'s `PUBLIC` allowlist. Consider `web/sw.mjs`'s `ASSETS` list and cache version if they belong in the offline shell. Do not cache `/api/*` or authenticated media payloads. Service-worker registration requires a secure context, such as HTTPS or localhost.

**Adding a feature:** update its `Services` operation and validation -> add an authorized server route -> wire `api()`/client action and view -> add fixtures and relevant tests -> update deployment/version/docs only where needed. A new integration may also require changes to service-name validation, public settings, UI connection forms, demo data and network allowlists.

## 8. Security and operational rules

- Real credentials, pairing tokens, config exports, certificates, database files and identifying machine/network details must not enter source, test fixtures, logs or public support reports. Use relative paths and synthetic fixtures.
- Keep source/config/legacy directories outside static serving. Preserve the explicit `PUBLIC` and `.dockerignore` allowlists.
- Do not turn adapters into an arbitrary URL proxy. Preserve URL/DNS destination checks, response limits, timeouts, TLS verification and refusal to follow redirects with credentials.
- Sonarr/Radarr requests use server-side `X-Api-Key` headers. SABnzbd requires a server-side query parameter; never log that URL or expose it to the browser.
- Preserve session, role, CSRF and origin enforcement. Never bypass security checks to make tests pass.
- In `DEMO_MODE=true`, the app supplies a synthetic viewer session and demo data; mutations are rejected. It is not production authentication and must stay visibly marked/read-only.
- Electron must retain `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` and web security. `connect-server` IPC is accepted only from the local connection screen. Keep navigation/popups and permissions restricted.
- Do not mutate real libraries, run production imports/removals, delete appdata, change repository visibility/history or publish artifacts without the owner's applicable approval. A confirmation implemented in the UI is not permission for an assistant to invoke the real API during testing.
- Use GitHub noreply identities for approved commits, without altering Git configuration automatically. Check status and the actual branch first. Do not assume old publication approval authorizes a new push or release.
- The old sibling `radarr-sonarr-search` checkout was deleted at the owner's request. Do not assume that backup exists or restore/push its pre-cleanup history. `legacy/` in this repository is a different, tracked reference directory.

## 9. Running and testing

Run commands from this repository root. Inspect `package.json` before changing tooling. Use `npm ci` for the lockfile; production has no npm dependency install step. Changes requiring a new dependency need a reason and a vetted version.

For an isolated source preview (PowerShell):

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '8765'
$env:CONFIG_DIR = Join-Path $PWD '.preview-config'
$env:DEMO_MODE = 'true'
npm start
```

Use a dedicated shell and config directory. These environment variables persist in that shell; clear them or open a fresh shell before non-demo work. Never point tests at production appdata.

| Command | What it verifies / does |
| --- | --- |
| `npm run check` | Syntax for active JS modules, selected JSON parsing and several security invariants. Not a comprehensive linter/typechecker. |
| `node scripts/privacy-check.mjs` | Pattern scan of tracked/unignored source paths with redacted findings. Not exhaustive secret or binary certification. |
| `npm test` | Node test runner: `tests/*.test.js`. |
| `npx playwright install chromium` then `npm run test:browser` | `tests/*.spec.js`: UI workflows, multiple devices/roles, responsive layouts, metadata escaping and automated WCAG checks. |
| `npm run test:desktop` | Electron client isolation/connection checks using a temporary profile and demo server. Requires a desktop-capable environment. |
| `npm audit --audit-level=moderate` | npm dependency advisory check, separate from OS/image scanning. |
| `docker build -t mastarr:test .` then `node scripts/docker-smoke.mjs mastarr:test` | Actual isolated Docker lifecycle, non-root/read-only runtime, authentication, persistence and image-content checks. |
| `npm run pack` / `npm run dist` | Windows unpacked build / NSIS installer under ignored `dist/`. Builds are not necessarily signed. |
| `node scripts/artifact-check.cjs` | Allowlist/privacy check of packaged application source in `dist/win-unpacked/resources/app.asar`; not exhaustive runtime-binary analysis. |
| `node scripts/release-check.mjs` | Release version agreement across package, server, Dockerfile and requested release. |

Test map:
- `tests/security.test.js`: authentication, setup, origin/CSRF, settings validation/redaction/encryption, public assets and logout.
- `tests/services.test.js`: numeric metadata safety, sequential read fallback, single writes, in-flight caching, unsafe URLs/artwork and redirects.
- `tests/workflows.test.js`: combined data, idempotency, bulk updates, episode ownership, import validation, grabs, removal and roles.
- `tests/fixtures.js`: mutable fake engine/client responses; extend for new adapter behavior, not real credentials.
- `tests/browser.spec.js`: browser workflows and accessibility; `playwright.config.js` currently uses one Chromium worker and blocks service workers. PWA caching changes therefore need an additional explicit service-worker test.
- `scripts/docker-smoke.mjs`: creates unique test containers/volumes and removes only those resources. Docker can reassign its temporary host port after restart, so the script re-reads it.

`createApp({ configDir, transport, demo, secureCookies })` supports isolated tests. Inject the fixture transport and bind to loopback/an ephemeral port. Tests with mocks do not prove compatibility with the owner's live indexers, storage permissions, engine versions or Unraid network. Match verification to the change; documentation-only edits do not require launching production services or publishing images.

## 10. Deployment and releases

- Image listens on port **8686**. `HOST` and `PORT` control source/server binding; packaged health checks/port mappings assume the standard container port.
- `docker-compose.yml` runs Mastarr with `/config` persisted, a read-only root filesystem, temporary `/tmp`, dropped capabilities and no new privileges. Default image UID/GID is 1000:1000; `mastarr.xml` uses Unraid's usual 99:100. Match host directory ownership.
- Compose variables include `MASTARR_CONFIG`, `MASTARR_UID`, `MASTARR_GID`, `MASTARR_BIND`, `MASTARR_PORT` and `TZ`.
- `compose.stack.yml` additionally requires `MEDIA_PATH` and accepts `MEDIA_UID`, `MEDIA_GID`, `ENGINE_BIND`. Only the engines get the shared `/data` media mount; Mastarr currently needs no media-file mount.
- Use container-reachable service addresses, not a phone's view of the network. Container `localhost` refers to that container.
- Remote access is through a VPN or external HTTPS reverse proxy. Set `PUBLIC_ORIGIN` and `SECURE_COOKIES=true` for a canonical HTTPS origin. The application is served at the origin root; do not assume subpath hosting is supported. No broad forwarded-header trust or automatic TLS/VPN provisioning exists.
- Desktop connects to that server, optionally via `MASTARR_SERVER_URL`; it does not start a private backend. It stores only the server address in `connection.json`, plus normal browser session data managed by Electron. `MASTARR_DESKTOP_PROFILE` isolates test profiles.
- `.github/workflows/verify.yml` runs source/privacy/dependency checks, Node/browser tests and Docker smoke tests on relevant pushes/PRs.
- `.github/workflows/release.yml` is manually dispatched. It verifies before publishing versioned AMD64/ARM64 images to Docker Hub at `radly82/mastarr`, with SBOM/provenance. A successful build alone is not proof of a published/publicly pullable image. Requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` GitHub secrets.
- `.github/workflows/windows.yml` requires a supplied signing identity, forces signing, verifies Authenticode and uploads the signed package/checksums. Do not call an unsigned local installer a signed release.
- Keep release version references consistent: `package.json`, lockfile metadata, `server.js`, Docker label, Compose image, Unraid image, README, service-worker cache and workflow defaults where applicable. Do not bump versions or dispatch publishing for ordinary documentation changes.

## 11. Current decisions and follow-ups

The owner prioritizes a polished, consistent UI and one Unraid-hosted configuration shared across devices. Preserve those goals instead of reintroducing per-device service keys or separate behavior for each layout.

- Native transcoding remains **shelved**, not an unfinished implementation to resume automatically.
- Full Sonarr/Radarr engine replacement is outside the implemented architecture.
- Public-history privacy cleanup was performed, but retained GitHub references/third-party copies cannot be declared erased without verification and, where needed, owner/GitHub Support action.
- Publisher-signed Windows distribution requires the owner's signing identity. No signing certificate or codec redistribution permission should be inferred from a prior conversation.
- Existing proprietary freeware terms are referenced in `legacy/about.html`; a public repository does not itself grant a new open-source license. Do not change licensing without approval.

Keep this guide and README aligned with future code changes. Prefer stable file/function references over brittle line numbers, and distinguish implemented behavior, test results, deployment status and future ideas.
