import {
  escape as e,
  icon,
  bytes,
  number,
  shortDate,
  time,
  relative,
  safeImage,
  badge,
  empty,
  skeleton,
} from './ui.mjs';
export const mediaKey = (item) => `${item.service}:${item.externalId || item.id}`;
const button = (action, label, symbol, classes = 'secondary', extra = '') =>
  `<button class="button ${classes}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label}</button>`;
export function poster(item, selectable = false, selected = false) {
  const hue = (Number(item.id) * 53 + 280) % 360;
  return `<article class="media-card ${selected ? 'selected' : ''}">
    <div class="poster-wrap"><button class="poster-button" data-action="details" data-key="${e(mediaKey(item))}" aria-label="View ${e(item.title)}">
      <img src="${e(safeImage(item.poster))}" alt="" loading="lazy" decoding="async" ${item.demoArtwork ? `class="demo-art hue-${Math.floor(hue / 60)}"` : ''}>
      ${item.demoArtwork ? `<span class="poster-wordmark">${e(item.title)}</span><span class="poster-edition">THE MASTARR COLLECTION</span>` : ''}
      <span class="poster-shade"></span><span class="poster-open">${icon('plus')}</span>
      ${item.rating ? `<span class="rating">${icon('star')}${Number(item.rating).toFixed(1)}</span>` : ''}
      <span class="poster-type">${icon(item.type)}${item.type === 'series' ? 'SERIES' : 'FILM'}</span>
    </button>${selectable ? `<label class="media-select"><input type="checkbox" data-select="${e(mediaKey(item))}" aria-label="Select ${e(item.title)}" ${selected ? 'checked' : ''}><span></span></label>` : ''}</div>
    <button class="media-title" data-action="details" data-key="${e(mediaKey(item))}">${e(item.title)}</button>
    <div class="media-meta"><span>${item.year || 'TBA'}${item.type === 'series' ? ` <span class="dot">·</span> ${item.seasonCount || '—'} seasons` : ''}</span><span class="status-dot ${e(item.status)}" role="img" title="${e(item.status)}" aria-label="${e(item.status)}"></span></div>
  </article>`;
}
export function problems(errors = []) {
  return errors.length
    ? `<div class="notice warning">${icon('warning')}<div><strong>Some connections need attention</strong><span>${errors.map((err) => `${e(err.service)}: ${e(err.message)}`).join(' · ')}</span></div><a href="#settings">Check connections ${icon('arrow')}</a></div>`
    : '';
}
export function queueRow(item, compact = false, editable = false) {
  const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
  const client = item.client || (item.service === 'sabnzbd' ? item : null);
  return `<article class="queue-row ${compact ? 'compact' : ''}"><div class="queue-symbol">${icon(item.status === 'warning' ? 'warning' : 'download')}</div><div class="queue-body"><div class="queue-title"><strong>${e(item.title)}</strong><span>${progress.toFixed(0)}<small>%</small></span></div><progress value="${progress}" max="100" aria-label="${e(item.title)} download progress">${progress}%</progress><div class="queue-meta"><span>${e(item.stage || item.status || 'Queued')}</span><span>${compact ? e(item.eta || 'Waiting') : `${e(bytes(item.size))} · ${e(item.eta || 'Waiting')} remaining`}</span></div>${item.messages?.length ? `<div class="queue-warning">${e(item.messages.join(' · '))}</div>` : ''}</div>${!compact && editable ? `<div class="queue-controls">${item.downloadId && item.service !== 'sabnzbd' ? button('review-import', 'Review import', 'library', 'secondary small', `data-service="${e(item.service)}" data-id="${item.id}"`) : ''}${client ? button('queue', item.status?.toLowerCase() === 'paused' ? 'Resume' : 'Pause', item.status?.toLowerCase() === 'paused' ? 'play' : 'pause', 'icon-button', `data-service="sabnzbd" data-id="${e(client.id)}" data-command="${item.status?.toLowerCase() === 'paused' ? 'resume' : 'pause'}"`) : ''}${item.status === 'warning' ? button('queue', 'Retry', 'refresh', 'secondary small', `data-service="${e(item.service)}" data-id="${e(item.id)}" data-command="retry"`) : ''}</div>` : ''}</article>`;
}
export function overview(state) {
  if (!state.library) return skeleton();
  const items = state.library.items;
  const available = items.filter((i) => i.status === 'available').length;
  const movies = items.filter((i) => i.type === 'movie').length;
  const series = items.length - movies;
  const recent = [...items]
    .sort((a, b) => (b.added || '').localeCompare(a.added || ''))
    .slice(0, 6);
  const upcoming = state.calendar?.items.slice(0, 4) || [];
  const queue = state.activity?.queue || [];
  const hero = recent.find((i) => i.backdrop) || recent[0];
  const used = items.reduce((total, i) => total + (i.size || 0), 0);
  const stats = [
    ['Your collection', number(items.length), `${movies} films · ${series} series`, 'library'],
    [
      'Ready to enjoy',
      number(available),
      items.length
        ? `${Math.round((available / items.length) * 100)}% of your library available`
        : 'Your next story starts here',
      'check',
    ],
    [
      'In motion',
      number(queue.length),
      state.activity?.speed
        ? `${bytes(state.activity.speed)}/s combined speed`
        : 'All caught up. Nice.',
      'download',
    ],
    ['Library footprint', bytes(used), 'Across your connected services', 'disk'],
  ];
  return `${problems(state.library.errors)}
    <div class="page-heading"><div><span class="eyebrow">EVERYTHING IN ITS PLACE</span><h1>Your media, together<span class="accent">.</span></h1><p>A little less managing. A lot more enjoying.</p></div><button class="button secondary small" data-action="refresh">${icon('refresh')}<span>Refresh</span></button></div>
    <div class="overview-top"><section class="hero"><img class="hero-art" src="${e(hero?.backdrop ? safeImage(hero.backdrop) : '/assets/landscape.svg')}" alt=""><div class="hero-overlay"></div><div class="hero-content"><span class="hero-label"><span></span>${items.length ? 'IN YOUR COLLECTION' : 'YOUR OWN LITTLE UNIVERSE'}</span><h2>${hero ? e(hero.title) : 'Great stories.<br>One home.'}</h2><div class="hero-metadata">${hero ? `${hero.year || ''}<span>·</span>${e(hero.genres?.slice(0, 2).join(' / ') || 'Your collection')}<span>·</span>${hero.rating ? `${icon('star')} ${Number(hero.rating).toFixed(1)}` : 'In your library'}` : 'Movies, series, and everything in between.'}</div><p>${items.length ? 'The next chapter is already waiting for you.' : 'Connect your services once. Bring your entire collection together on every screen.'}</p><div class="hero-buttons">${hero ? button('details', 'View details', 'arrow', 'primary', `data-key="${e(mediaKey(hero))}"`) : '<a class="button primary" href="#settings">Connect your services ' + icon('arrow') + '</a>'}<a class="hero-link" href="#library">Browse library ${icon('chevron')}</a></div></div><div class="hero-caption">PRIVATE BY DESIGN <span>·</span> MADE FOR YOUR COLLECTION</div></section>
    <section class="panel download-panel"><div class="section-heading"><h2>In progress <span class="count">${queue.length}</span></h2><span class="live-indicator">LIVE</span></div>${
      queue.length
        ? queue
            .slice(0, 2)
            .map((i) => queueRow(i, true))
            .join('')
        : `<div class="quiet-state">${icon('check')}<h3>All caught up</h3><p>New downloads will appear here.</p></div>`
    }<a class="panel-link" href="#activity">View all activity ${icon('arrow')}</a></section></div>
    <section class="stats-row" aria-label="Library statistics">${stats.map(([label, value, detail, symbol]) => `<article class="stat"><span class="stat-icon">${icon(symbol)}</span><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail}</span></article>`).join('')}</section>
    <section class="recent-section"><div class="section-heading"><div><h2>Recently added</h2><p>The newest arrivals in your collection.</p></div><a class="text-link" href="#library">View library ${icon('arrow')}</a></div>${recent.length ? `<div class="poster-grid home-posters">${recent.map((i) => poster(i)).join('')}</div>` : empty('Your collection starts here', 'Connect Sonarr or Radarr in Settings. Existing titles will appear automatically.', '<a href="#settings" class="button secondary">Connect a service</a>')}</section>
    <div class="overview-bottom"><section class="panel"><div class="section-heading"><h2>On the horizon</h2><a class="text-link" href="#calendar">Calendar ${icon('arrow')}</a></div>${upcoming.length ? upcoming.map((i) => calendarRow(i)).join('') : '<div class="subtle-empty">No upcoming releases in the next 30 days.</div>'}</section><section class="panel system-panel"><div class="section-heading"><h2>Your connections</h2>${icon('shield')}</div>${connectionRows(state.health)}<div class="system-note">${icon('shield')}Credentials stay on your server. Always.</div></section></div>`;
}
export function connectionRows(health) {
  return (
    health?.services ||
    ['sonarr', 'radarr', 'sabnzbd'].map((name) => ({ name, status: 'unconfigured' }))
  )
    .map(
      (s) =>
        `<div class="connection-row"><span class="service-icon ${s.name}">${icon(s.name === 'sonarr' ? 'series' : s.name === 'radarr' ? 'movie' : 'download')}</span><div><strong>${s.name === 'sabnzbd' ? 'SABnzbd' : s.name === 'sonarr' ? 'Sonarr' : 'Radarr'}</strong><span>${s.status === 'online' ? `${e(s.version || '')} · ${s.latency || 0}ms` : e(s.error || 'Add a connection in Settings')}</span></div>${badge(s.status)}</div>`,
    )
    .join('');
}
export function library(state, discovery = false) {
  const source = discovery && state.query ? state.searchResults : state.library;
  if (!source) return skeleton();
  let items = source.items.filter(
    (i) =>
      (state.type === 'all' || i.type === state.type) &&
      (state.status === 'all' || i.status === state.status) &&
      (!state.genre || i.genres?.includes(state.genre)) &&
      (discovery || !state.query || i.title.toLowerCase().includes(state.query.toLowerCase())),
  );
  const genres = [...new Set(source.items.flatMap((i) => i.genres || []))].sort();
  items.sort((a, b) =>
    state.sort === 'title'
      ? a.title.localeCompare(b.title)
      : state.sort === 'rating'
        ? (b.rating || 0) - (a.rating || 0)
        : state.sort === 'year'
          ? (b.year || 0) - (a.year || 0)
          : (b.added || '').localeCompare(a.added || ''),
  );
  const selected = state.selected.size;
  const editable = state.session.user.role !== 'viewer';
  return `${problems(source.errors)}<div class="page-heading"><div><span class="eyebrow">${discovery ? 'MAKE ROOM FOR SOMETHING GOOD' : 'CURATED BY YOU'}</span><h1>${discovery ? 'Find your next favorite' : 'Your collection'}<span class="accent">.</span></h1><p>${discovery ? 'One search. Movies and series, side by side.' : `${number(source.items.length)} stories. One beautifully organized home.`}</p></div>${!discovery ? '<a class="button primary" href="#discover">' + icon('plus') + 'Add something new</a>' : ''}</div>
    ${discovery ? `<div class="discovery-search"><label class="search-field">${icon('search')}<input id="discover-query" type="search" placeholder="Search any movie or series…" value="${e(state.query)}" aria-label="Search movies and series" autocomplete="off"><kbd>ENTER</kbd></label><button class="button primary" data-action="search">Search ${icon('arrow')}</button></div>${!state.query ? '<div class="suggestions"><span>A little inspiration</span>' + ['Dune', 'Severance', 'Interstellar', 'The Bear'].map((q) => `<button data-action="suggest" data-query="${q}">${q} ${icon('arrow')}</button>`).join('') + '</div>' : ''}` : ''}
    <div class="library-toolbar"><div class="segmented" role="group" aria-label="Media type">${[
      ['all', 'Everything'],
      ['movie', 'Movies'],
      ['series', 'Series'],
    ]
      .map(
        ([id, label]) =>
          `<button data-action="type" data-value="${id}" class="${state.type === id ? 'active' : ''}" aria-pressed="${state.type === id}">${id !== 'all' ? icon(id) : ''}${label}</button>`,
      )
      .join(
        '',
      )}</div><div class="toolbar-filters"><label class="sr-only" for="status-filter">Availability</label><select id="status-filter" data-filter="status">${[
      ['all', 'All statuses'],
      ['available', 'Available'],
      ['missing', 'Missing'],
      ['partial', 'Partial'],
      ['untracked', 'Not in library'],
    ]
      .map(
        ([id, label]) =>
          `<option value="${id}" ${state.status === id ? 'selected' : ''}>${label}</option>`,
      )
      .join(
        '',
      )}</select><label class="sr-only" for="genre-filter">Genre</label><select id="genre-filter" data-filter="genre"><option value="">All genres</option>${genres.map((g) => `<option ${state.genre === g ? 'selected' : ''}>${e(g)}</option>`).join('')}</select><label class="sr-only" for="sort-filter">Sort by</label><select id="sort-filter" data-filter="sort">${[
      ['recent', 'Recently added'],
      ['title', 'Title A–Z'],
      ['rating', 'Highest rated'],
      ['year', 'Newest year'],
    ]
      .map(
        ([id, label]) =>
          `<option value="${id}" ${state.sort === id ? 'selected' : ''}>${label}</option>`,
      )
      .join(
        '',
      )}</select><div class="segmented view-toggle"><button class="${state.layout === 'grid' ? 'active' : ''}" data-action="layout" data-value="grid" aria-label="Poster grid" aria-pressed="${state.layout === 'grid'}">${icon('grid')}</button><button class="${state.layout === 'table' ? 'active' : ''}" data-action="layout" data-value="table" aria-label="Table view" aria-pressed="${state.layout === 'table'}">${icon('list')}</button></div></div></div>
    <div class="results-line"><span>${number(items.length)} ${discovery && state.query ? 'results' : 'titles'}${state.query ? ` matching “${e(state.query)}”` : ''}</span><div>${button('save-filter', 'Save view', 'filter', 'text-button')}${state.savedFilter ? button('load-filter', 'Saved view', 'heart', 'text-button') : ''}${!discovery && editable ? button('select-all', selected ? 'Clear selection' : 'Select visible', 'check', 'text-button') : ''}</div></div>
    ${selected ? `<div class="bulk-bar"><strong>${selected} selected</strong><span>Apply to your selection</span>${button('bulk', 'Monitor', 'check', 'secondary small', 'data-command="monitor"')}${button('bulk', 'Unmonitor', 'pause', 'secondary small', 'data-command="unmonitor"')}${button('bulk', 'Search missing', 'search', 'secondary small', 'data-command="search"')}${button('bulk', 'Refresh', 'refresh', 'secondary small', 'data-command="refresh"')}${button('bulk-quality', 'Quality profile', 'settings', 'secondary small')}${button('select-all', 'Clear', 'close', 'text-button')}</div>` : ''}
    ${
      items.length
        ? state.layout === 'grid'
          ? `<div class="poster-grid">${items
              .slice(0, state.limit)
              .map((i) => poster(i, !discovery && editable, state.selected.has(mediaKey(i))))
              .join('')}</div>`
          : `<div class="table-wrap"><table class="media-table"><thead><tr><th>Title</th><th>Year</th><th>Type</th><th>Status</th><th>Quality</th><th>Size</th></tr></thead><tbody>${items
              .slice(0, state.limit)
              .map(
                (i) =>
                  `<tr><td>${!discovery && editable ? `<input type="checkbox" data-select="${e(mediaKey(i))}" aria-label="Select ${e(i.title)}" ${state.selected.has(mediaKey(i)) ? 'checked' : ''}>` : ''}<button data-action="details" data-key="${e(mediaKey(i))}">${e(i.title)}</button></td><td>${i.year || '—'}</td><td>${i.type === 'movie' ? 'Movie' : 'Series'}</td><td>${badge(i.status)}</td><td>${e(i.quality || '—')}</td><td>${bytes(i.size)}</td></tr>`,
              )
              .join('')}</tbody></table></div>`
        : empty(
            discovery && state.query ? 'No matches this time' : 'Nothing here yet',
            discovery
              ? 'Try a different title, or check that your services are connected.'
              : 'Connect a service or adjust your filters to see your media.',
            '<a class="button secondary" href="#settings">Connection settings</a>',
            'search',
          )
    }
    ${items.length > state.limit ? `<div class="load-more">${button('load-more', `Show more (${items.length - state.limit} remaining)`, 'plus')}</div>` : ''}`;
}
export function activity(state) {
  const data = state.activity;
  if (!data) return skeleton();
  const editable = state.session.user.role !== 'viewer';
  return `${problems(data.errors)}<div class="page-heading"><div><span class="eyebrow">THE ENGINE ROOM</span><h1>Everything in motion<span class="accent">.</span></h1><p>From the first byte to the final import.</p></div><span class="speed-pill">${icon('activity')}${bytes(data.speed)}/s</span></div><div class="library-toolbar"><div class="segmented"><button data-action="activity-tab" data-value="queue" class="${state.activityTab === 'queue' ? 'active' : ''}">Queue <span class="count">${data.queue.length}</span></button><button data-action="activity-tab" data-value="history" class="${state.activityTab === 'history' ? 'active' : ''}">History</button><button data-action="activity-tab" data-value="events" class="${state.activityTab === 'events' ? 'active' : ''}">Mastarr log</button></div><span class="muted small-text">${state.refreshing ? 'Updating…' : 'Refreshes while this page is visible'}</span></div><section class="panel activity-panel">${state.activityTab === 'queue' ? (data.queue.length ? data.queue.map((i) => queueRow(i, false, editable)).join('') : empty('All quiet on the download front', 'New downloads and import warnings will appear here.', '<a href="#discover" class="button secondary">Find something new</a>', 'check')) : state.activityTab === 'history' ? (data.history.length ? data.history.map((h) => `<article class="history-row"><span class="history-icon">${icon(h.status === 'Failed' ? 'warning' : 'check')}</span><div><strong>${e(h.title)}</strong><span>${shortDate(h.date)} · ${time(h.date)} · ${e(typeof h.size === 'number' ? bytes(h.size) : h.size || '')}</span></div>${badge(h.status === 'Failed' ? 'warning' : 'available', h.status)}${editable && h.status === 'Failed' && h.service === 'sabnzbd' ? button('queue', 'Retry', 'refresh', 'secondary small', `data-service="sabnzbd" data-id="${e(h.id)}" data-command="retry"`) : ''}</article>`).join('') : empty('A fresh start', 'Completed downloads from SABnzbd will appear here.', '', 'clock')) : state.events.length ? state.events.map((ev) => `<article class="history-row"><span class="history-icon">${icon('activity')}</span><div><strong>${e(ev.title)}</strong><span>${e(ev.user)} · ${e(ev.action)}</span></div><time>${relative(ev.time)}</time></article>`).join('') : empty('No recent actions', 'Changes made through Mastarr will appear here.', '', 'activity')}</section>`;
}
export function calendarRow(item) {
  const date = new Date(item.date);
  return `<button class="calendar-row" data-action="details" data-key="${e(mediaKey(item))}"><span class="calendar-date"><small>${Number.isNaN(date.getTime()) ? 'TBA' : date.toLocaleDateString(undefined, { month: 'short' })}</small><strong>${Number.isNaN(date.getTime()) ? '—' : date.getDate()}</strong></span><span class="calendar-info"><strong>${e(item.title || 'Upcoming release')}</strong><span>${item.episodeNumber ? `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')} · ` : ''}${e(item.episodeTitle || item.releaseType)}</span></span>${item.type ? icon(item.type) : icon('calendar')}</button>`;
}
export function calendar(state) {
  if (!state.calendar) return skeleton();
  const items = state.calendar.items;
  return `${problems(state.calendar.errors)}<div class="page-heading"><div><span class="eyebrow">SOMETHING TO LOOK FORWARD TO</span><h1>On the horizon<span class="accent">.</span></h1><p>Episodes, digital releases, and cinema dates. Together.</p></div><div class="segmented"><button data-action="calendar-range" data-value="7" class="${state.calendarDays === 7 ? 'active' : ''}">7 days</button><button data-action="calendar-range" data-value="30" class="${state.calendarDays === 30 ? 'active' : ''}">30 days</button></div></div><div class="calendar-summary">${icon('calendar')}<strong>${items.length} upcoming releases</strong><span>Times shown in ${e(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></div><section class="panel calendar-panel">${items.length ? items.map(calendarRow).join('') : empty('A little breathing room', 'No monitored releases in this date range. Try the 30-day view.', '', 'calendar')}</section>`;
}
export function settings(state) {
  if (state.session.user.role !== 'admin') return account(state);
  if (!state.settings) return skeleton();
  return `<div class="page-heading"><div><span class="eyebrow">MAKE YOURSELF AT HOME</span><h1>A setup that stays yours<span class="accent">.</span></h1><p>Connect once. Your server takes care of every screen.</p></div>${badge('online', 'Server-side settings')}</div><div class="notice">${icon('shield')}<div><strong>Your credentials never leave the server after saving.</strong><span>Leave an API key blank to keep the existing value. No browser storage. No keys in shareable URLs.</span></div></div>${!state.session.secure && !state.dismissHttpWarning ? `<div class="notice warning dismissible">${icon('warning')}<div><strong>This connection uses HTTP.</strong><span>Use only on a trusted LAN or VPN. For remote access, configure an HTTPS reverse proxy, PUBLIC_ORIGIN, and SECURE_COOKIES=true.</span></div><button class="notice-dismiss" data-action="dismiss-http-warning" aria-label="Dismiss this notice">${icon('close')}</button></div>` : ''}
    <div class="settings-grid">${['sonarr', 'radarr', 'sabnzbd']
      .map((name) => {
        const s = state.settings.services[name];
        const label = name === 'sonarr' ? 'Sonarr' : name === 'radarr' ? 'Radarr' : 'SABnzbd';
        const health = state.health?.services.find((h) => h.name === name);
        return `<form class="panel connection-form" data-form="service" data-service="${name}"><div class="section-heading"><div class="connection-heading"><span class="service-icon ${name}">${icon(name === 'sonarr' ? 'series' : name === 'radarr' ? 'movie' : 'download')}</span><div><h2>${label}</h2><p>${name === 'sonarr' ? 'The home for your series' : name === 'radarr' ? 'Your movie collection' : 'Your Usenet downloads'}</p></div></div><label class="switch"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''} aria-label="Enable ${label}"><span></span></label></div><div class="toggle-hint">Flip on, then click Save connection below</div><div class="connection-status">${badge(health?.status || 'unconfigured')}${health?.version ? `<span>v${e(health.version)}</span>` : ''}</div><label>Service URL<input name="url" type="url" value="${e(s.url)}" placeholder="http://${name}:${name === 'sonarr' ? '8989' : name === 'radarr' ? '7878' : '8080'}" autocomplete="off"></label><span class="field-help">An address reachable from the Mastarr container, not from your phone.</span><label>API key <span class="label-hint">${s.hasApiKey ? 'Saved securely' : 'Required when enabled'}</span><input name="apiKey" type="password" placeholder="${s.hasApiKey ? 'Leave blank to keep saved key' : `Paste your ${label} API key`}" autocomplete="new-password" maxlength="512"></label><details class="advanced"><summary>Advanced connection ${icon('down')}</summary><label>Fallback URL <span class="label-hint">Optional, reads only</span><input name="fallbackUrl" type="url" value="${e(s.fallbackUrl || '')}" placeholder="https://your-service-address" autocomplete="off"></label><span class="field-help">Read requests can fail over. Writes are sent once to prevent duplicate actions.</span></details>${name !== 'sabnzbd' ? `<div class="default-options" id="defaults-${name}"><label>Default root folder<input name="defaultRootFolder" value="${e(s.defaultRootFolder || '')}" placeholder="Load available options below"></label><label>Default quality profile<select name="defaultQualityProfileId"><option value="${s.defaultQualityProfileId || 0}">${s.defaultQualityProfileId ? `Saved profile #${s.defaultQualityProfileId}` : 'Choose when adding media'}</option></select></label></div>` : ''}<div class="form-result" role="status"></div><div class="form-actions"><button class="button primary" type="submit">Save connection ${icon('check')}</button><button type="button" class="button secondary" data-action="test-connection">Test</button>${name !== 'sabnzbd' ? '<button type="button" class="button text-button" data-action="load-options">Load options</button>' : ''}</div></form>`;
      })
      .join('')}</div>
    <section class="panel import-panel"><div><h2>Bring your old setup along</h2><p>Import a legacy Mastarr settings JSON file. Credentials are encrypted on this server.</p></div><label class="button secondary file-button">${icon('download')}Import settings<input id="import-settings" type="file" accept="application/json,.json" class="sr-only"></label></section>
    <section class="panel health-detail"><div class="section-heading"><h2>System health</h2>${button('refresh', 'Check again', 'refresh', 'secondary small')}</div>${connectionRows(state.health)}${
      state.health?.services
        .flatMap((s) => s.warnings || [])
        .map(
          (w) => `<div class="notice warning">${icon('warning')}<span>${e(w.message)}</span></div>`,
        )
        .join('') || ''
    }${
      state.health?.services
        .flatMap((s) => s.disks || [])
        .slice(0, 4)
        .map(
          (d) =>
            `<div class="disk-row"><div>${icon('disk')}<strong>${e(d.label)}</strong><span>${bytes(d.freeSpace)} free of ${bytes(d.totalSpace)}</span></div><progress value="${Math.max(0, (d.totalSpace || 0) - (d.freeSpace || 0))}" max="${d.totalSpace || 1}" aria-label="Storage usage"></progress></div>`,
        )
        .join('') || ''
    }</section>
    ${accounts(state)}${account(state, true)}`;
}
function accounts(state) {
  return `<section class="panel accounts-panel"><div class="section-heading"><div><h2>A place for everyone</h2><p>Separate accounts. One shared library.</p></div>${icon('user')}</div><div class="account-list">${(state.users || []).map((u) => `<div><span class="avatar">${e(u.username.slice(0, 1).toUpperCase())}</span><strong>${e(u.username)}</strong><span class="badge neutral">${e(u.role)}</span></div>`).join('')}</div><form data-form="user" class="account-form"><label>Username<input name="username" autocomplete="off" pattern="[A-Za-z0-9_.\\-]{3,32}" minlength="3" maxlength="32" required></label><label>Password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><label>Access<select name="role"><option value="viewer">Viewer — browse only</option><option value="operator">Operator — manage media</option><option value="admin">Admin — manage everything</option></select></label><button class="button secondary" type="submit">${icon('plus')}Create account</button><div class="form-result" role="status"></div></form></section>`;
}
function account(state, embedded = false) {
  return `${embedded ? '' : '<div class="page-heading"><div><h1>Your account</h1><p>Shared library. Your own access.</p></div></div>'}<section class="panel account-security"><h2>Keep your account secure</h2><p>Changing your password signs out all of your devices.</p><form data-form="password" class="account-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><button class="button secondary" type="submit">Change password</button><div class="form-result" role="status"></div></form></section>`;
}
export function detail(item, options, editable, loading = false) {
  const id = mediaKey(item);
  const existing = !!item.id;
  return `<button class="dialog-close icon-button" data-action="close-detail" aria-label="Close details">${icon('close')}</button><div class="detail-banner"><img src="${e(safeImage(item.backdrop || '/assets/landscape.svg'))}" alt=""><div></div></div><div class="detail-content"><img class="detail-poster ${item.demoArtwork ? 'demo-art hue-4' : ''}" src="${e(safeImage(item.poster))}" alt="Poster for ${e(item.title)}"><div class="detail-heading"><span class="eyebrow">${item.type === 'series' ? 'THE NEXT EPISODE AWAITS' : 'MAKE IT A MOVIE NIGHT'}</span><h2>${e(item.title)}</h2><div class="detail-meta">${item.year || 'TBA'}<span>·</span>${item.runtime ? `${item.runtime} min` : item.type}${item.rating ? `<span>·</span>${icon('star')}${Number(item.rating).toFixed(1)}` : ''}</div><div class="genre-chips">${(
    item.genres || []
  )
    .slice(0, 4)
    .map((g) => `<span>${e(g)}</span>`)
    .join(
      '',
    )}</div><div class="detail-status">${badge(item.status)}<span>${item.monitored ? 'Monitored' : 'Not monitored'}</span></div></div><div class="detail-description"><h3>The story</h3><p>${e(item.overview || 'No synopsis available for this title.')}</p></div>${loading ? '<div class="detail-loading"><span class="loader"></span>Fetching library details…</div>' : ''}${editable && options ? `<form data-form="media" data-key="${e(id)}" class="detail-form"><h3>${existing ? 'Make it yours' : 'Add to your collection'}</h3><div class="detail-fields"><label>Quality profile<select name="qualityProfileId" required>${options.profiles.map((p) => `<option value="${p.id}" ${p.id === (item.qualityProfileId || options.defaultQualityProfileId) ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>${!existing ? `<label>Root folder<select name="rootFolderPath" required>${options.roots.map((r) => `<option value="${e(r.path)}" ${r.path === options.defaultRootFolder ? 'selected' : ''}>${e(r.path)} · ${bytes(r.freeSpace)} free</option>`).join('')}</select></label><label>Monitor<select name="monitor"><option value="all">All ${item.type === 'series' ? 'episodes' : 'releases'}</option><option value="future">Future ${item.type === 'series' ? 'episodes' : 'releases'}</option><option value="none">Do not monitor</option></select></label><label class="checkbox-label"><input name="searchNow" type="checkbox" checked>Search immediately after adding</label>` : `<label class="checkbox-label"><input name="monitored" type="checkbox" ${item.monitored ? 'checked' : ''}>Monitor for releases and upgrades</label>`}</div><div class="form-result" role="status"></div><button class="button primary" type="submit">${icon(existing ? 'check' : 'plus')}${existing ? 'Save changes' : `Add ${item.type === 'series' ? 'series' : 'movie'}`}</button></form>` : ''}${editable && existing ? `<div class="detail-actions">${button('media-command', 'Search missing', 'search', 'secondary', 'data-command="search"')}${button('media-command', 'Refresh metadata', 'refresh', 'secondary', 'data-command="refresh"')}${button('remove-title', 'Remove from library', 'close', 'text-button danger')}</div>` : ''}
    ${
      item.type === 'series' && item.seasons?.length
        ? `<section class="season-section"><div class="section-heading"><h3>Seasons & episodes</h3><span>${item.episodeFileCount || 0} / ${item.episodeCount || 0} available</span></div>${item.seasons
            .filter((s) => s.number > 0)
            .map(
              (s) =>
                `<details class="season"><summary><span>${icon('series')}Season ${s.number}</span><span>${s.monitored ? 'Monitored' : 'Not monitored'} ${icon('down')}</span></summary>${editable ? button('season-monitor', s.monitored ? 'Stop monitoring season' : 'Monitor season', 'check', 'secondary small', `data-season="${s.number}" data-monitored="${!s.monitored}"`) : ''}${(
                  item.episodes || []
                )
                  .filter((ep) => ep.season === s.number)
                  .map(
                    (ep) =>
                      `<div class="episode"><span class="episode-number">${String(ep.number).padStart(2, '0')}</span><div><strong>${e(ep.title)}</strong><span>${shortDate(ep.airDate)}</span></div>${badge(ep.hasFile ? 'available' : 'missing')}${editable ? button('episode-monitor', ep.monitored ? 'Unmonitor episode' : 'Monitor episode', ep.monitored ? 'check' : 'plus', 'icon-button', `data-episode="${ep.id}" data-monitored="${!ep.monitored}"`) + button('release-search', 'Search releases', 'search', 'icon-button', `data-episode="${ep.id}"`) : ''}</div>`,
                  )
                  .join('')}</details>`,
            )
            .join('')}</section>`
        : ''
    }
    ${editable && existing && item.type === 'movie' ? `<section class="releases-section"><h3>Choose your release</h3><p>See quality, size, indexer, and why a release was rejected.</p>${button('release-search', 'Find releases', 'search', 'secondary')}</section>` : ''}<div id="release-results"></div>
    ${item.history?.length ? `<section class="detail-history"><h3>Title history</h3>${item.history.map((h) => `<div class="history-row"><span class="history-icon">${icon('clock')}</span><div><strong>${e(h.event)}</strong><span>${e(h.title)} · ${e(h.quality)}</span></div><time>${shortDate(h.date)}</time></div>`).join('')}</section>` : ''}</div>`;
}
export function releases(items) {
  return `<section class="releases-section"><div class="section-heading"><h3>Available releases</h3><span>${items.length} results</span></div>${items.length ? items.map((r, index) => `<article class="release-row"><div><strong>${e(r.title)}</strong><div class="release-meta"><span>${e(r.quality)}</span><span>${bytes(r.size)}</span><span>${e(r.indexer)}</span><span>${e(r.protocol)}</span></div>${r.rejections.length ? `<p class="rejection">${icon('warning')}${e(r.rejections.join(' · '))}</p>` : ''}</div><button class="button ${r.rejected ? 'secondary' : 'primary'} small" data-action="grab" data-index="${index}">${icon('download')}${r.rejected ? 'Review & grab' : 'Grab'}</button></article>`).join('') : '<p>No releases returned. Check your indexers and quality profiles.</p>'}</section>`;
}
