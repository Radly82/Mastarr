import {
  escape as e,
  icon,
  bytes,
  safeImage,
  toast,
  confirmAction,
  skeleton,
  empty,
} from './ui.mjs';
import * as view from './views.mjs';
const root = document.getElementById('root');
const dialog = document.getElementById('detail-dialog');
const readPreference = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const savePreference = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const state = {
  session: null,
  view: 'overview',
  library: null,
  health: null,
  activity: null,
  calendar: null,
  events: [],
  settings: null,
  users: [],
  query: '',
  searchResults: null,
  type: 'all',
  status: 'all',
  genre: '',
  sort: 'recent',
  layout: readPreference('mastarr-view', 'grid'),
  selected: new Set(),
  limit: 48,
  activityTab: 'queue',
  calendarDays: 30,
  refreshing: false,
  savedFilter: readPreference('mastarr-filter', null),
  dismissHttpWarning: readPreference('mastarr-dismiss-http-warning', false),
  detail: null,
  detailOptions: null,
  releases: [],
  episodeId: null,
  busy: new Set(),
};
let detailVersion = 0,
  searchVersion = 0,
  searchTimer,
  pollTimer;
const views = ['overview', 'library', 'discover', 'activity', 'calendar', 'settings'];
const requestId = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
async function api(route, body, options = {}) {
  const response = await fetch(route, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            'X-CSRF-Token': state.session?.csrf || '',
            'X-Request-ID': options.requestId || requestId(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!response.ok) {
    if (response.status === 401 && !route.includes('/auth/')) {
      state.session.user = null;
      renderAuth();
    }
    throw new Error(data.error || 'The request could not be completed.');
  }
  return data;
}
function theme() {
  const value = readPreference('mastarr-theme', 'dark');
  document.documentElement.dataset.theme = value === 'light' ? 'light' : 'dark';
  const chromeColor = document.querySelector('meta[name="theme-color"]');
  if (chromeColor)
    chromeColor.content = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg')
      .trim();
}
theme();
function renderAuth(error = '') {
  clearTimeout(pollTimer);
  const setup = state.session?.setupRequired;
  root.innerHTML = `<main id="main" class="auth-page"><section class="auth-art"><img src="/assets/landscape.svg" alt="" class="auth-landscape"><a class="brand" href="/"><img src="/assets/mark.svg" alt="" width="38" height="38"><span>mastarr<span class="brand-dot">.</span></span></a><div class="auth-manifesto"><span class="eyebrow">YOUR MEDIA. YOUR SPACE.</span><h1>All your stories.<br>One beautiful<br><span>home.</span></h1><p>Movies, series, and everything in between.<br>Finally together. Entirely yours.</p><div class="auth-features"><span>${icon('shield')}Private by design</span><span>${icon('library')}One shared library</span></div></div><div class="auth-art-footer">SELF-HOSTED <span>·</span> NO CLOUD REQUIRED</div></section><section class="auth-form-wrap"><div class="auth-mobile-brand"><img src="/assets/mark.svg" alt="Mastarr" width="42" height="42"></div><div class="auth-form-content"><span class="eyebrow">${setup ? 'A FRESH START' : 'YOUR CONTROL ROOM IS WAITING'}</span><h2>${setup ? 'Make yourself at home.' : 'Good to see you again.'}</h2><p>${setup ? 'Claim your server, then connect your services. You only need to do this once.' : 'Sign in to your private media collection.'}</p><form data-form="auth" class="auth-form">${setup ? `<label>Pairing code<input name="token" type="text" autocomplete="off" required placeholder="6-character code" pattern="[A-Za-z0-9]{6}" maxlength="6" class="pairing-code-input"></label><details class="pairing-help"><summary>Where do I find my pairing code?</summary><p><strong>In Unraid:</strong> Click the Mastarr container icon → <strong>Logs</strong>. Your code is printed at the top of the log.</p><p><strong>Or in a terminal:</strong></p><code>docker exec mastarr cat /config/setup-token</code><p>This one-time code protects your unclaimed server. It is removed after setup.</p></details>` : ''}<label>Username<input name="username" autocomplete="username" pattern="[A-Za-z0-9_.\\-]{3,32}" minlength="3" maxlength="32" required placeholder="${setup ? 'Choose a username' : 'Your username'}"></label><label>Password<input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="12" maxlength="256" required placeholder="${setup ? 'At least 12 characters' : 'Your password'}"></label><div class="form-result error" role="alert">${e(error)}</div><button class="button primary auth-submit" type="submit">${setup ? 'Create your control room' : 'Enter your control room'}${icon('arrow')}</button></form><div class="auth-note">${icon('shield')}Your account belongs to this server.<br>No third-party account required.</div></div><span class="auth-footer">Mastarr ${e(state.session?.version || '14.0.0')} <span>·</span> Your media, together.</span></section></main>`;
}
function renderShell() {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar" id="sidebar"><a href="#overview" class="brand"><img src="/assets/mark.svg" alt="" width="34" height="34"><span>mastarr<span class="brand-dot">.</span></span></a><span class="nav-label">YOUR WORKSPACE</span><nav aria-label="Main navigation">${views
    .slice(0, 5)
    .map(
      (id, i) =>
        `<a href="#${id}" data-nav="${id}">${icon(['home', 'library', 'discover', 'activity', 'calendar'][i])}<span>${['Overview', 'Library', 'Discover', 'Activity', 'Calendar'][i]}</span>${id === 'activity' ? '<span class="nav-count" id="nav-downloads">0</span>' : ''}</a>`,
    )
    .join(
      '',
    )}</nav><div class="sidebar-divider"></div><span class="nav-label">YOUR SYSTEM</span><nav aria-label="System navigation"><a href="#settings" data-nav="settings">${icon('settings')}<span>${state.session.user.role === 'admin' ? 'Settings' : 'Account'}</span></a><button data-action="health">${icon('activity')}<span>System health</span><span class="connection-dot" id="system-dot"></span></button></nav><div class="sidebar-bottom"><div class="server-status"><span class="connection-dot"></span><div><strong>Your private instance</strong><span>${state.session.demo ? 'READ-ONLY PREVIEW' : 'SELF-HOSTED & CONNECTED'}</span></div>${icon('shield')}</div><div class="sidebar-version">Mastarr ${e(state.session.version)}<span>Made for your collection</span></div></div></aside><button class="sidebar-scrim" data-action="menu" aria-label="Close navigation"></button><div class="workspace"><header class="topbar"><div class="topbar-location"><button class="icon-button mobile-menu" data-action="menu" aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button><span class="workspace-label">Workspace</span>${icon('chevron')}<strong id="breadcrumb">Overview</strong></div><label class="global-search">${icon('search')}<input id="global-search" type="search" placeholder="Search your next story…" aria-label="Search all movies and series" autocomplete="off"><kbd>⌘ K</kbd></label><div class="topbar-actions"><button class="icon-button" data-action="theme" aria-label="Toggle light and dark theme">${icon('sun')}</button><button class="icon-button notification-button" data-action="health" aria-label="Connection health and notifications">${icon('bell')}<span id="notification-dot" hidden></span></button><span class="topbar-divider"></span><button class="avatar" data-action="account-menu" aria-label="Account and sign out">${e(state.session.user.username.slice(0, 1).toUpperCase())}</button></div></header>${state.session.demo ? '<div class="demo-banner"><span class="preview-label">PREVIEW</span>Sample collection · Read-only · No real services connected<a href="#settings">About this preview</a></div>' : ''}<main id="main" tabindex="-1" class="main-content"></main><footer class="app-footer"><span>${icon('shield')}Your library. Your server. Your rules.</span><span id="sync-status">Connecting…</span></footer></div></div>`;
  renderMain();
}
function renderMain() {
  const main = document.getElementById('main');
  if (!main || !state.session?.user) return;
  const focused = document.activeElement;
  const focusId = focused?.id;
  const selection = focused?.selectionStart;
  if (state.view === 'overview') main.innerHTML = view.overview(state);
  else if (state.view === 'library' || state.view === 'discover')
    main.innerHTML = view.library(state, state.view === 'discover');
  else if (state.view === 'activity') main.innerHTML = view.activity(state);
  else if (state.view === 'calendar') main.innerHTML = view.calendar(state);
  else if (state.session.demo)
    main.innerHTML = `<div class="page-heading"><div><span class="eyebrow">THE MASTARR PREVIEW</span><h1>Your server. Your rules<span class="accent">.</span></h1><p>This collection is sample data, not a live media server.</p></div></div><section class="panel">${view.connectionRows(state.health)}<div class="notice">${icon('shield')}<div><strong>Ready for your own collection?</strong><span>Start the container without DEMO_MODE, claim it with your pairing token, and connect Sonarr, Radarr and SABnzbd. All configuration stays on the server. No device-by-device setup.</span></div></div></section>`;
  else main.innerHTML = view.settings(state);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === state.view;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const crumb = document.getElementById('breadcrumb');
  if (crumb) crumb.textContent = state.view[0].toUpperCase() + state.view.slice(1);
  document.title = `${crumb?.textContent || 'Mastarr'} — Mastarr`;
  document.getElementById('nav-downloads').textContent = state.activity?.queue.length || 0;
  const offline = state.health?.services.some((s) => s.status === 'offline' || s.warnings?.length);
  document.getElementById('system-dot').classList.toggle('warning', !!offline);
  document.getElementById('notification-dot').hidden = !offline;
  const sync = document.getElementById('sync-status');
  if (sync)
    sync.textContent = state.refreshing
      ? 'Syncing your collection…'
      : `Last synced ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (focusId && main.querySelector(`#${CSS.escape(focusId)}`)) {
    const replacement = document.getElementById(focusId);
    replacement.focus({ preventScroll: true });
    if (typeof selection === 'number' && replacement.type === 'search')
      replacement.setSelectionRange(selection, selection);
  }
}
function items() {
  return [
    ...(state.library?.items || []),
    ...(state.searchResults?.items || []),
    ...(state.calendar?.items || []),
  ];
}
function findItem(key) {
  return items().find((item) => view.mediaKey(item) === key);
}
async function refresh(quiet = false) {
  if (state.refreshing || !state.session?.user) return;
  state.refreshing = true;
  const end = new Date(Date.now() + state.calendarDays * 86400000).toISOString().slice(0, 10);
  const jobs = [
    ['library', '/api/library'],
    ['health', '/api/health'],
    ['activity', '/api/activity'],
    ['calendar', `/api/calendar?end=${end}`],
    ['events', '/api/events'],
  ];
  const results = await Promise.allSettled(
    jobs.map(async ([key, route]) => {
      const value = await api(route);
      state[key] = key === 'events' ? value.events : value;
    }),
  );
  state.refreshing = false;
  if (state.session?.user && (!quiet || ['overview', 'activity', 'calendar'].includes(state.view)))
    renderMain();
  if (!quiet) {
    const failure = results.find((r) => r.status === 'rejected');
    if (failure) toast(failure.reason.message, true);
  }
  schedulePoll();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!state.session?.user) return;
  pollTimer = setTimeout(async () => {
    if (!document.hidden) await refresh(true);
    else schedulePoll();
  }, 15000);
}
async function loadSettings() {
  if (state.session.demo || state.session.user.role !== 'admin') return;
  try {
    const [settings, accounts] = await Promise.all([api('/api/settings'), api('/api/users')]);
    state.settings = settings;
    state.users = accounts.users;
    if (state.view === 'settings') renderMain();
  } catch (error) {
    toast(error.message, true);
  }
}
function route() {
  const previous = state.view;
  const hash = location.hash.slice(1);
  state.view = views.includes(hash) ? hash : 'overview';
  if (previous !== state.view) {
    state.query = '';
    const search = document.getElementById('global-search');
    if (search) search.value = '';
  }
  state.selected.clear();
  state.limit = 48;
  if (state.view !== 'library' && state.view !== 'discover') {
    state.query = '';
    state.type = 'all';
    state.status = 'all';
    state.genre = '';
  }
  root.classList.remove('menu-open');
  renderMain();
  window.scrollTo({ top: 0 });
  if (state.view === 'settings') loadSettings();
}
async function search() {
  const version = ++searchVersion;
  const q = state.query.trim();
  if (q.length < 2) {
    state.searchResults = null;
    renderMain();
    return;
  }
  try {
    const result = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (version !== searchVersion) return;
    state.searchResults = result;
    renderMain();
  } catch (error) {
    if (version === searchVersion) toast(error.message, true);
  }
}
async function openDetails(item) {
  if (!item) return toast('Refresh the collection and try again.', true);
  const version = ++detailVersion;
  state.detail = item;
  state.detailOptions = null;
  state.releases = [];
  state.episodeId = null;
  const editable = state.session.user.role !== 'viewer';
  dialog.innerHTML = view.detail(item, null, editable, true);
  if (!dialog.open) dialog.showModal();
  try {
    const [details, options] = await Promise.all([
      item.id ? api(`/api/media/${item.service}/${item.id}`) : Promise.resolve(item),
      editable
        ? api(`/api/options/${item.service}`).catch((error) => {
            toast(error.message, true);
            return null;
          })
        : Promise.resolve(null),
    ]);
    if (version !== detailVersion || !dialog.open) return;
    state.detail = { ...item, ...details };
    state.detailOptions = options;
    if (options) {
      const defaults = state.settings?.services[item.service];
      options.defaultRootFolder = defaults?.defaultRootFolder || options.defaultRootFolder;
      options.defaultQualityProfileId =
        defaults?.defaultQualityProfileId || options.defaultQualityProfileId;
    }
    dialog.innerHTML = view.detail(state.detail, options, editable);
  } catch (error) {
    if (version !== detailVersion || !dialog.open) return;
    dialog.innerHTML =
      view.detail(item, null, editable) +
      `<div class="detail-error" role="alert">${e(error.message)}</div>`;
  }
}
function serviceInput(form) {
  const data = new FormData(form);
  const result = {
    enabled: data.has('enabled'),
    url: String(data.get('url') || ''),
    fallbackUrl: String(data.get('fallbackUrl') || ''),
    apiKey: String(data.get('apiKey') || ''),
  };
  if (form.dataset.service !== 'sabnzbd') {
    result.defaultRootFolder = String(data.get('defaultRootFolder') || '');
    result.defaultQualityProfileId = Number(data.get('defaultQualityProfileId') || 0);
  }
  return result;
}
function formStatus(form, message, error = false) {
  const el = form.querySelector('.form-result');
  if (el) {
    el.textContent = message;
    el.classList.toggle('error', error);
  }
}
async function formSubmit(form) {
  const kind = form.dataset.form;
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  formStatus(form, 'Working…');
  try {
    if (kind === 'auth') {
      const firstRun = state.session.setupRequired;
      const result = await api(
        `/api/auth/${state.session.setupRequired ? 'setup' : 'login'}`,
        data,
      );
      state.session = { ...state.session, ...result, setupRequired: false };
      state.view = firstRun
        ? 'settings'
        : views.includes(location.hash.slice(1))
          ? location.hash.slice(1)
          : 'overview';
      location.hash = state.view;
      renderShell();
      await refresh();
      await loadSettings();
    } else if (kind === 'service') {
      const name = form.dataset.service;
      state.settings = await api('/api/settings', { services: { [name]: serviceInput(form) } });
      renderMain();
      const savedForm = document.querySelector(`form[data-service="${name}"]`);
      formStatus(savedForm, 'Connection saved securely. The API key field clears by design.');
      toast('Connection saved. Every device now uses this configuration.');
      await refresh(true);
    } else if (kind === 'media') {
      const item = state.detail;
      if (!item) return;
      const body = item.id
        ? { qualityProfileId: Number(data.qualityProfileId), monitored: data.monitored === 'on' }
        : {
            externalId: item.externalId,
            qualityProfileId: Number(data.qualityProfileId),
            rootFolderPath: data.rootFolderPath,
            monitor: data.monitor,
            searchNow: data.searchNow === 'on',
          };
      await api(`/api/media/${item.service}${item.id ? `/${item.id}` : ''}`, body);
      dialog.close();
      toast(item.id ? 'Library settings updated.' : `${item.title} added to your collection.`);
      await refresh();
    } else if (kind === 'user') {
      await api('/api/users', data);
      toast('Account created.');
      form.reset();
      await loadSettings();
    } else if (kind === 'password') {
      await api('/api/auth/password', data);
      state.session.user = null;
      renderAuth('Password changed. Sign in with your new password.');
    }
  } catch (error) {
    formStatus(form, error.message, true);
  } finally {
    if (submit) submit.disabled = false;
  }
}
async function releaseSearch(episode) {
  const item = state.detail;
  const version = detailVersion;
  state.episodeId = episode ? Number(episode) : null;
  const target = dialog.querySelector('#release-results');
  target.innerHTML =
    '<div class="detail-loading"><span class="loader"></span>Searching your indexers…</div>';
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const releases = await api(
      `/api/media/${item.service}/${item.id}/releases${episode ? `?episodeId=${Number(episode)}` : ''}`,
    );
    if (version !== detailVersion) return;
    state.releases = releases;
    target.innerHTML = view.releases(releases);
  } catch (error) {
    if (version === detailVersion)
      target.innerHTML = `<div class="detail-error">${e(error.message)}</div>`;
  }
}
async function action(button) {
  const action = button.dataset.action;
  if (state.busy.has(button)) return;
  const key = button.dataset.key;
  if (action === 'details') return openDetails(findItem(key));
  if (action === 'close-detail') return dialog.close();
  if (action === 'theme') {
    savePreference(
      'mastarr-theme',
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
    );
    theme();
    return;
  }
  if (action === 'menu') {
    const open = root.classList.toggle('menu-open');
    document.querySelector('.mobile-menu').setAttribute('aria-expanded', String(open));
    return;
  }
  if (action === 'type') {
    state.type = button.dataset.value;
    state.limit = 48;
    return renderMain();
  }
  if (action === 'layout') {
    state.layout = button.dataset.value;
    savePreference('mastarr-view', state.layout);
    return renderMain();
  }
  if (action === 'activity-tab') {
    state.activityTab = button.dataset.value;
    return renderMain();
  }
  if (action === 'load-more') {
    state.limit += 48;
    return renderMain();
  }
  if (action === 'save-filter') {
    state.savedFilter = {
      type: state.type,
      status: state.status,
      genre: state.genre,
      sort: state.sort,
    };
    savePreference('mastarr-filter', state.savedFilter);
    toast('View saved on this device.');
    return renderMain();
  }
  if (action === 'load-filter' && state.savedFilter) {
    Object.assign(state, state.savedFilter);
    return renderMain();
  }
  if (action === 'select-all') {
    if (state.selected.size) state.selected.clear();
    else
      document.querySelectorAll('[data-select]').forEach((input) => {
        if (state.selected.size < 50) state.selected.add(input.dataset.select);
      });
    return renderMain();
  }
  if (action === 'suggest') {
    state.query = button.dataset.query;
    return search();
  }
  if (action === 'search') {
    state.query = document.getElementById('discover-query')?.value || state.query;
    return search();
  }
  if (action === 'calendar-range') {
    state.calendarDays = Number(button.dataset.value);
    return refresh();
  }
  if (action === 'dismiss-http-warning') {
    state.dismissHttpWarning = true;
    savePreference('mastarr-dismiss-http-warning', true);
    renderMain();
    return;
  }
  if (action === 'account-menu') {
    const confirmed = await confirmAction(
      `Signed in as ${state.session.user.username}`,
      `Your role: ${state.session.user.role}. Settings are shared across devices; signing out only disconnects this browser.`,
      'Sign out',
    );
    if (confirmed && !state.session.demo) {
      await api('/api/auth/logout', {});
      state.session.user = null;
      state.library = null;
      state.settings = null;
      renderAuth();
    }
    return;
  }
  if (action === 'health') {
    const content = (state.health?.services || [])
      .map(
        (s) =>
          `${s.name}: ${s.status}${s.error ? ` — ${s.error}` : ''}${s.warnings?.length ? ` — ${s.warnings.map((w) => w.message).join('; ')}` : ''}`,
      )
      .join('\n');
    if (
      await confirmAction(
        'Your system at a glance',
        content || 'Health checks are loading.',
        'Open settings',
      )
    )
      location.hash = 'settings';
    return;
  }
  state.busy.add(button);
  button.disabled = true;
  try {
    if (action === 'refresh') {
      await refresh();
      toast('Your collection is up to date.');
    } else if (action === 'test-connection') {
      const form = button.closest('form');
      formStatus(form, 'Testing from your Mastarr server…');
      try {
        const result = await api(
          `/api/connections/${form.dataset.service}/test`,
          serviceInput(form),
        );
        formStatus(form, `Connected · v${result.version || 'unknown'} · ${result.latency}ms`);
      } catch (error) {
        formStatus(form, error.message, true);
      }
    } else if (action === 'load-options') {
      const form = button.closest('form');
      const name = form.dataset.service;
      const currentRoot = form.querySelector('[name="defaultRootFolder"]').value;
      const currentQuality = Number(form.querySelector('[name="defaultQualityProfileId"]').value);
      formStatus(form, 'Saving the connection and loading options…');
      state.settings = await api('/api/settings', { services: { [name]: serviceInput(form) } });
      form.querySelector('[name="apiKey"]').value = '';
      let options;
      try {
        options = await api(`/api/options/${name}`);
      } catch (error) {
        formStatus(form, `Connection saved, but ${error.message}`, true);
        return;
      }
      document.getElementById(`defaults-${name}`).innerHTML =
        `<label>Default root folder<select name="defaultRootFolder">${options.roots.map((r) => `<option value="${e(r.path)}" ${r.path === currentRoot ? 'selected' : ''}>${e(r.path)} · ${bytes(r.freeSpace)} free</option>`).join('')}</select></label><label>Default quality profile<select name="defaultQualityProfileId">${options.profiles.map((p) => `<option value="${p.id}" ${p.id === currentQuality ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>`;
      formStatus(form, 'Connection saved and options loaded.');
    } else if (action === 'media-command') {
      const item = state.detail;
      if (
        await confirmAction(
          `${button.textContent.trim()}?`,
          `Submit this action for ${item.title}? Search actions may start downloads.`,
          'Submit action',
        )
      ) {
        await api(`/api/media/${item.service}/${item.id}/command`, {
          action: button.dataset.command,
        });
        toast('Action accepted by your media service.');
        await refresh();
      }
    } else if (action === 'season-monitor') {
      const item = state.detail;
      await api(`/api/media/${item.service}/${item.id}`, {
        seasons: [
          { number: Number(button.dataset.season), monitored: button.dataset.monitored === 'true' },
        ],
      });
      toast('Season monitoring updated.');
      await openDetails(item);
      await refresh();
    } else if (action === 'episode-monitor') {
      const item = state.detail;
      await api(`/api/media/sonarr/${item.id}/episode`, {
        episodeId: Number(button.dataset.episode),
        monitored: button.dataset.monitored === 'true',
      });
      toast('Episode monitoring updated.');
      await openDetails(item);
    } else if (action === 'remove-title') {
      const item = state.detail;
      if (
        await confirmAction(
          `Remove ${item.title}?`,
          'This removes the title from the media engine and stops monitoring. Your existing media files will be kept on disk.',
          'Remove, keep files',
        )
      ) {
        await api(`/api/media/${item.service}/${item.id}/remove`, {
          confirmation: item.title,
          keepFiles: true,
        });
        dialog.close();
        toast('Title removed. Existing files were preserved.');
        await refresh();
      }
    } else if (action === 'review-import') {
      const target = { service: button.dataset.service, id: button.dataset.id };
      const version = ++detailVersion;
      state.importTarget = target;
      dialog.innerHTML = `<button class="dialog-close icon-button" data-action="close-detail" aria-label="Close import review">${icon('close')}</button><div class="import-review"><span class="eyebrow">THE FINAL STEP</span><h2>Review this import</h2><p>Files and matches are resolved by your media engine, not by this browser.</p><div class="detail-loading"><span class="loader"></span>Checking files…</div></div>`;
      if (!dialog.open) dialog.showModal();
      const candidates = await api(`/api/queue/${target.service}/${target.id}/import`);
      if (version !== detailVersion || !dialog.open) return;
      state.importCandidates = candidates;
      dialog.querySelector('.detail-loading').outerHTML = candidates.length
        ? `<div class="import-files">${candidates.map((c) => `<label class="import-file"><input type="checkbox" name="import-id" value="${c.id}" ${c.matched ? 'checked' : 'disabled'}><span><strong>${e(c.filename)}</strong><small>${e(c.title)} · ${e(c.quality)} · ${bytes(c.size)}</small>${c.rejections.length ? `<small class="danger">${e(c.rejections.join(' · '))}</small>` : ''}${!c.matched ? '<small>No media match. Match this file in the media engine before importing.</small>' : ''}</span></label>`).join('')}</div><button class="button primary" data-action="import-files">${icon('download')}Import selected files</button>`
        : '<div class="subtle-empty">No files ready for manual import. The download may still be processing.</div>';
    } else if (action === 'import-files') {
      const ids = [...dialog.querySelectorAll('[name="import-id"]:checked')].map((input) =>
        Number(input.value),
      );
      if (!ids.length) throw new Error('Select at least one matched file.');
      const warnings = state.importCandidates
        .filter((c) => ids.includes(c.id))
        .flatMap((c) => c.rejections);
      if (
        await confirmAction(
          `Import ${ids.length} files?`,
          warnings.length
            ? warnings.join('\n')
            : 'The media engine will import the selected files into their matched library titles.',
          'Import files',
        )
      ) {
        await api(`/api/queue/${state.importTarget.service}/${state.importTarget.id}/import`, {
          ids,
          confirmRejected: warnings.length > 0,
        });
        dialog.close();
        toast('Import submitted to your media engine.');
        await refresh();
      }
    } else if (action === 'release-search') await releaseSearch(button.dataset.episode);
    else if (action === 'grab') {
      const release = state.releases[Number(button.dataset.index)];
      if (!release) return;
      if (
        await confirmAction(
          release.rejected ? 'This release was rejected' : 'Grab this release?',
          release.rejected ? release.rejections.join('\n') : release.title,
          'Grab release',
        )
      ) {
        await api(`/api/media/${state.detail.service}/${state.detail.id}/grab`, {
          guid: release.guid,
          indexerId: release.indexerId,
          episodeId: state.episodeId,
          confirmRejected: release.rejected,
        });
        toast('Release sent to the download client.');
        await refresh();
      }
    } else if (action === 'queue') {
      const cmd = button.dataset.command;
      const verb = cmd === 'remove' ? 'Remove this stuck import from' : cmd === 'pause' ? 'Pause' : cmd === 'resume' ? 'Resume' : cmd === 'retry' ? 'Retry' : 'Change';
      if (
        await confirmAction(
          `${verb} download?`,
          cmd === 'remove'
            ? 'This removes the item from the Sonarr/Radarr queue. The downloaded files on disk are not deleted. You can re-import manually if needed.'
            : 'This changes the download on your server.',
          'Continue',
        )
      ) {
        await api(`/api/queue/${button.dataset.service}/${button.dataset.id}`, {
          action: cmd,
        });
        toast(cmd === 'remove' ? 'Removed from queue.' : 'Download action submitted.');
        await refresh();
      }
    } else if (action === 'bulk' || action === 'bulk-quality') {
      const selected = [...state.selected].map(findItem).filter(Boolean);
      if (!selected.length) return;
      let profile;
      if (action === 'bulk-quality') {
        const service = selected[0].service;
        if (selected.some((i) => i.service !== service))
          throw new Error(
            'Select only movies or only series to apply a quality profile. Profiles differ by service.',
          );
        const options = await api(`/api/options/${service}`);
        const confirm = document.getElementById('confirm-dialog');
        confirm.innerHTML = `<form method="dialog"><h2>Choose a quality profile</h2><p>Apply to ${selected.length} selected titles.</p><label>Profile<select id="bulk-profile">${options.profiles.map((p) => `<option value="${p.id}">${e(p.name)}</option>`).join('')}</select></label><div class="dialog-buttons"><button class="button secondary" value="cancel">Cancel</button><button class="button primary" value="confirm">Apply profile</button></div></form>`;
        confirm.returnValue = '';
        confirm.showModal();
        if (
          !(await new Promise((resolve) =>
            confirm.addEventListener('close', () => resolve(confirm.returnValue === 'confirm'), {
              once: true,
            }),
          ))
        )
          return;
        profile = Number(document.getElementById('bulk-profile').value);
      } else if (
        !(await confirmAction(
          `${button.textContent.trim()} ${selected.length} titles?`,
          'This applies to every selected title. Search actions may start multiple downloads.',
          'Apply action',
        ))
      )
        return;
      const result = await api('/api/bulk', {
        action: action === 'bulk-quality' ? 'quality' : button.dataset.command,
        qualityProfileId: profile,
        items: selected.map((i) => ({ service: i.service, id: i.id })),
      });
      const failed = result.results.filter((r) => !r.ok);
      toast(
        `${result.results.length - failed.length} updated${failed.length ? `; ${failed.length} failed: ${failed[0].error}` : '.'}`,
        !!failed.length,
      );
      state.selected.clear();
      await refresh();
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.busy.delete(button);
    button.disabled = false;
  }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) action(button).catch((error) => toast(error.message, true));
});
document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (form) {
    event.preventDefault();
    formSubmit(form);
  }
});
document.addEventListener('change', async (event) => {
  const target = event.target;
  if (target.name === 'enabled' && target.closest('form[data-form="service"]')) {
    const form = target.closest('form');
    const name = form.dataset.service;
    const hasKey = form.querySelector('[name="apiKey"]').value.trim() || state.settings?.services?.[name]?.hasApiKey;
    const hasUrl = form.querySelector('[name="url"]').value.trim();
    if (target.checked && !hasUrl) {
      target.checked = false;
      formStatus(form, 'Enter the service URL before enabling.', true);
      return;
    }
    if (target.checked && !hasKey) {
      target.checked = false;
      formStatus(form, 'Enter the API key before enabling.', true);
      return;
    }
    formStatus(form, 'Saving…');
    try {
      state.settings = await api('/api/settings', { services: { [name]: serviceInput(form) } });
      renderMain();
      const savedForm = document.querySelector(`form[data-service="${name}"]`);
      formStatus(savedForm, target.checked ? 'Connection enabled and saved.' : 'Connection disabled and saved.');
      toast(`${name} ${target.checked ? 'enabled' : 'disabled'}.`);
      await refresh(true);
    } catch (error) {
      target.checked = !target.checked;
      formStatus(form, error.message, true);
    }
    return;
  }
  if (target.dataset.filter) {
    state[target.dataset.filter] = target.value;
    state.limit = 48;
    renderMain();
  }
  if (target.dataset.select) {
    if (target.checked && state.selected.size >= 50) {
      target.checked = false;
      return toast('Select up to 50 titles per bulk action.', true);
    }
    if (target.checked) state.selected.add(target.dataset.select);
    else state.selected.delete(target.dataset.select);
    renderMain();
  }
  if (target.id === 'import-settings' && target.files[0]) {
    const file = target.files[0];
    try {
      if (file.size > 262144) throw new Error('Settings file is too large.');
      const input = JSON.parse(await file.text());
      if (
        await confirmAction(
          'Import legacy settings?',
          'This replaces matching service connections on this server. Your imported keys will be encrypted.',
          'Import securely',
        )
      ) {
        state.settings = await api('/api/settings/import', input);
        renderMain();
        toast('Legacy settings imported securely.');
        await refresh(true);
      }
    } catch (error) {
      toast(error.message, true);
    }
    target.value = '';
  }
});
document.addEventListener('input', (event) => {
  if (!['global-search', 'discover-query'].includes(event.target.id)) return;
  state.query = event.target.value;
  if (state.view !== 'discover') {
    state.view = 'discover';
    state.type = 'all';
    state.status = 'all';
    state.genre = '';
    location.hash = 'discover';
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(search, 400);
});
document.addEventListener('keydown', (event) => {
  if (
    (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) ||
    (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName))
  ) {
    event.preventDefault();
    document.getElementById('global-search')?.focus();
  }
  if (event.key === 'Enter' && ['global-search', 'discover-query'].includes(event.target.id)) {
    event.preventDefault();
    clearTimeout(searchTimer);
    search();
  }
  if (event.key === 'Escape') root.classList.remove('menu-open');
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  detailVersion++;
  state.detail = null;
});
document.addEventListener(
  'error',
  (event) => {
    const img = event.target;
    if (img.tagName === 'IMG' && !img.src.endsWith('/assets/poster.svg'))
      img.src = '/assets/poster.svg';
  },
  true,
);
window.addEventListener('hashchange', () => {
  if (state.session?.user) route();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.session?.user) refresh(true);
});
window.addEventListener('online', () => {
  if (state.session?.user) refresh(true);
});
async function boot() {
  try {
    state.session = await api('/api/auth/session');
    if (!state.session.user) return renderAuth();
    state.view = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    renderShell();
    await refresh();
    if (state.view === 'settings') await loadSettings();
  } catch (error) {
    root.innerHTML = `<main id="main" class="offline-page"><img src="/assets/mark.svg" alt="Mastarr" width="56" height="56"><h1>Your server is taking a moment.</h1><p>${e(error.message)}</p><a href="/" class="button primary">Try again ${icon('refresh')}</a></main>`;
  }
}
boot();
if ('serviceWorker' in navigator && window.isSecureContext)
  navigator.serviceWorker.register('/sw.mjs', { type: 'module' }).catch(() => {});
