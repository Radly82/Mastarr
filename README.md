# Mastarr

**Your media, together.** A private, self-hosted control room for movies, series, downloads and release calendars. Version 2.0.5.

**For coding assistants and contributors:** start with [AGENTS.md](AGENTS.md) for the architecture, file map, request flows, security rules, development commands and release workflow.

Mastarr runs once on your server. Connect Sonarr, Radarr and SABnzbd once; every browser and desktop client uses that shared configuration. Service API keys are encrypted on the server and are never returned to client devices. Devices only need the Mastarr address and an account.

## What you can do

- Browse a combined movie/series library with poster and table views, filtering, sorting, saved views and bulk actions.
- Search both engines, add titles with explicit quality/root-folder choices, and control monitoring.
- View title details, seasons, episodes, file availability and history.
- Search releases, inspect quality/indexer/rejection reasons, and confirm manual grabs.
- Manage series, season and episode monitoring; refresh metadata and search missing media.
- Monitor a deduplicated download queue, use SABnzbd pause/resume/retry, and review imports through the media engines.
- See a combined release calendar, service health and disk capacity.
- Use administrator, operator and read-only accounts.
- Remove library records with explicit confirmation while preserving media files.
- Use responsive desktop/mobile layouts, keyboard navigation, dark/light themes and an installable web shell.

## Important scope

Mastarr is a unified management application, **not a replacement for the Sonarr/Radarr automation engines**. They still perform indexing, release parsing, scheduling, importing, renaming and upgrades. Existing engine configurations remain the source of truth. Initial indexer/download-client setup, unmatched-file repair and advanced engine-specific administration are performed in those engines.

The optional full-stack Compose file starts Mastarr and the engines together. This is a single deployment composed of separate services, not a monolithic replacement engine. Building independent replacement automation engines is a separate product project; this release deliberately retains the proven engines.

## Install on Unraid

### Build from source

Clone this repository onto the server, then run from its root:

```sh
git clone https://github.com/Radly82/Mastarr.git
cd Mastarr
docker compose up -d --build
```

This uses a persistent named volume and publishes port **8686**. Open `http://YOUR-UNRAID-IP:8686` from your home network. With an Unraid custom IP network, use the container's IP and port 8686 instead.

For an Unraid appdata bind mount, create a dedicated writable directory owned by the user you run the container as. Set these values in a local `.env` file before starting Compose:

```dotenv
MASTARR_CONFIG=/mnt/user/appdata/mastarr
MASTARR_UID=99
MASTARR_GID=100
MASTARR_PORT=8686
TZ=UTC
```

The image defaults to UID/GID 1000:1000. Standard Unraid installations commonly use 99:100. Do not make configuration world-readable or use privileged mode to work around permission errors. The container needs write access to `/config`; its application filesystem is read-only.

### Use the Unraid template

`mastarr.xml` defines the appdata mount, port 8686 and an unprivileged runtime. Its versioned Docker Hub image is produced by the **Release Docker** workflow. Until that workflow has successfully published the image, build locally and use `mastarr:2.0.5` as the repository/image instead. The Docker Hub repository must be public if anonymous pulls are desired.

### First-run setup

1. Open Mastarr's page.
2. Click the Mastarr container icon in Unraid → **Logs**. Your 6-character pairing code is printed at the top of the log. Alternatively, run:

   ```sh
   docker exec mastarr cat /config/setup-token
   ```

3. Enter that pairing code and create an administrator with a password of at least 12 characters. The code is removed after setup.
4. In Settings, enter each service URL and API key, enable the connection, test it, and save.
5. Load root-folder and quality-profile options and save your preferred defaults.
6. Create household accounts if desired. Other devices only sign in to Mastarr; do not enter the service keys again.

The URLs must be reachable **from the container**. `localhost` inside Mastarr refers to Mastarr itself. Use service DNS names on a shared Docker network or your server's LAN address. Sonarr/Radarr use `X-Api-Key` headers. SABnzbd requires its key in the server-to-server request; Mastarr does not expose that request to browsers or log its URL.

### Optional: deploy the engines with Mastarr

Set `MEDIA_PATH` to a parent directory containing your movies, television and downloads. The same parent is mounted at `/data` in each engine so imports and hardlinks can use consistent paths.

```sh
docker compose -f docker-compose.yml -f compose.stack.yml up -d --build
```

The supplied stable engine versions were selected from releases older than seven days. Engines bind their administration ports to loopback by default. For initial setup, use an SSH tunnel or set `ENGINE_BIND` to your server's trusted LAN interface temporarily. Configure authentication on the engines before making them reachable beyond that interface.

Use these addresses in Mastarr:

- Sonarr: `http://sonarr:8989`
- Radarr: `http://radarr:7878`
- SABnzbd: `http://sabnzbd:8080`

Configure each engine's root folders, indexers and download client once, then enter its API key in Mastarr. This optional stack does not automatically discover or collect keys from other applications. The engines have their own licenses and update requirements.

## Remote access

For home-only access, HTTP is supported on a trusted LAN. For access away from home, prefer a VPN such as Tailscale or WireGuard into that network.

For an HTTPS reverse proxy, set both:

```dotenv
PUBLIC_ORIGIN=https://YOUR-MASTARR-HOSTNAME
SECURE_COOKIES=true
```

Proxy to Mastarr's port 8686 without stripping the request Origin header. Use the canonical HTTPS address from home and remotely. Secure cookies will intentionally not work on a plain HTTP IP address. Do not forward the unauthenticated engine ports to the internet. Mastarr is not a VPN or TLS termination server.

## Security and persistence

- `/config/mastarr.db` holds accounts, encrypted service configuration, hashed session tokens and a bounded action log.
- `/config/encryption.key` protects the encrypted configuration with AES-256-GCM. The directory and key are restricted to the container user.
- Passwords use scrypt. Cookies are HttpOnly and SameSite=Strict; HTTPS mode adds Secure and a `__Host-` prefix.
- Mutations require a valid session, role, same-origin request and CSRF token. Media mutations also require an idempotency identifier.
- Writes are never raced across service addresses or retried automatically. After an uncertain timeout, inspect Activity before submitting a new action.
- Service adapters accept only predefined operations. Requests reject metadata/link-local destinations, pin validated DNS results, and do not follow redirects with credentials.
- Artwork is proxied from configured engines or allowlisted TMDB/TVDB artwork hosts. No arbitrary image proxy is provided.
- Only explicitly allowed web assets are served. Source files, the database, configuration, legacy files and `.git` are not served or copied into the image.
- The web app stores only harmless display preferences locally, not credentials, sessions or media payloads. Offline support caches the application shell, never API responses.
- Encryption protects against accidental disclosure of the database alone, not a compromised host or a backup containing both the database and encryption key.

### Backup and recovery

Stop Mastarr and back up the **entire `/config` volume**, including the encryption key, before upgrades or host migration. Treat backups as confidential. Restore the complete directory to a compatible owner before starting the container. Restoring only the database without its encryption key will fail safely.

The Settings page can import a legacy settings JSON file. Check the imported connections, then securely remove unencrypted legacy copies from your own backups or disk when you no longer need them. Do not upload configuration exports, appdata, database files, signing certificates or support traces containing real credentials to GitHub.

### Public-history privacy cleanup

The identified personal email addresses, developer machine paths and private-network details were removed from the published main history, and old installer binaries were removed from that history. The original local checkout was subsequently deleted at the owner's request; do not assume that backup still exists or reintroduce pre-cleanup history from another copy.

GitHub may retain old commits by their original IDs after a history rewrite. The repository owner must ask GitHub Support to remove retained/cached references and review any remaining links. A force-push cannot erase third-party clones or previously downloaded files. Rotate any credential known to have been exposed, even if its source was subsequently removed.

## Desktop and mobile

The Windows application is a sandboxed client for the Docker server. It saves only the server URL locally; accounts, service settings and keys remain on the server. It rejects cross-origin navigation, popups and renderer Node access. The new entry point no longer uses the obsolete local HTML application.

```sh
npm ci
npm run desktop
npm run pack
npm run dist
```

Local packages are not publisher-signed unless a signing identity is configured. Do not represent them as signed releases. The **Signed Windows Package** workflow requires `CSC_LINK` and `CSC_KEY_PASSWORD`, forces code signing, verifies Authenticode signatures and creates checksums before uploading artifacts. Provide certificates through private GitHub Actions secrets, never repository files.

On mobile, use the responsive web app. With HTTPS, supported browsers can install it to the home screen. The legacy Android/WebView package is not the supported client for this release; it is superseded by the shared web app. Native Android store distribution/signing is not provided by this release.

## Development and verification

Requires Node.js 24. The production server has **no third-party npm runtime dependencies**; it uses Node's built-in HTTP, crypto and SQLite modules. Development dependencies are pinned in the lockfile.

```sh
npm ci
npm run check
node scripts/privacy-check.mjs
npm audit --audit-level=moderate
npm test
npx playwright install chromium
npm run test:browser
docker build -t mastarr:2.0.5 .
node scripts/docker-smoke.mjs mastarr:2.0.5
```

The tests use temporary configuration and simulated service adapters. They do not touch your real media services. Browser tests cover desktop, phone and tablet layouts, shared settings, role restrictions, escaped metadata, search/add/release workflows and navigation. Docker checks exercise a real non-root container, a read-only application filesystem and configuration/session persistence after restart. The optional complete media stack still requires validation against your actual indexers, storage permissions and engine configuration.

For a read-only design preview:

```sh
docker run --rm -p 127.0.0.1:8765:8686 -e DEMO_MODE=true mastarr:2.0.5
```

The preview is clearly marked as sample data; writes are disabled. Do not enable demo mode on your production instance.

Current application code lives in `server.js`, `backend/`, `web/` and `desktop/`. Earlier layouts and launchers are retained in `legacy/` for reference, excluded from runtime and packages. The original proprietary freeware terms remain in the legacy About page; this refactor does not introduce a new license grant. Third-party components retain their own licenses.
