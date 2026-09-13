export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  library:
    '<rect x="3" y="4" width="6" height="16" rx="1.5"/><rect x="12" y="4" width="3" height="16" rx="1"/><path d="m18 4 3 16"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-14 4h2m4 0h2m-8 3h2"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3z"/><circle cx="12" cy="11" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  movie:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4M7 12h10"/>',
  series: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="m7 2 5 5 5-5m-8 11h6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-12 13h6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5m10-4a8 8 0 0 0-13-2M5 16a8 8 0 0 0 13 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  disk: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18m-5 2.5h2m-6 0h1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  logout: '<path d="M9 4H4v16h5m6-12 4 4-4 4M8 12h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m7 3 14 9-14 9z"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  heart:
    '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
};
export const icon = (name, className = '') =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.movie}</svg>`;
export const bytes = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
};
export const number = (n) => new Intl.NumberFormat().format(Number(n) || 0);
export const shortDate = (date) =>
  date && !Number.isNaN(Date.parse(date))
    ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'TBA';
export const time = (date) =>
  date && !Number.isNaN(Date.parse(date))
    ? new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
export const relative = (date) => {
  const minutes = Math.round((Date.now() - Date.parse(date)) / 60000);
  return !Number.isFinite(minutes)
    ? ''
    : minutes < 1
      ? 'Just now'
      : minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}h ago`
          : `${Math.floor(minutes / 1440)}d ago`;
};
export const safeImage = (url) =>
  typeof url === 'string' && /^\/(api\/art\/[a-f0-9]{64}|assets\/[a-z-]+\.svg)$/.test(url)
    ? url
    : '/assets/poster.svg';
export const badge = (status, text) =>
  `<span class="badge ${['available', 'partial', 'missing', 'untracked', 'online', 'offline', 'unconfigured', 'downloading', 'warning'].includes(status) ? status : 'neutral'}">${escape(text || { available: 'Available', partial: 'Partial', missing: 'Missing', untracked: 'Not in library', online: 'Connected', offline: 'Offline', unconfigured: 'Not connected' }[status] || status)}</span>`;
export const empty = (title, detail, action = '', name = 'library') =>
  `<section class="empty-state"><div class="empty-icon">${icon(name)}</div><h3>${escape(title)}</h3><p>${escape(detail)}</p>${action}</section>`;
export const skeleton = () =>
  `<div class="loading-grid" aria-label="Loading media" role="status">${Array.from({ length: 6 }, () => '<div class="skeleton"><div></div><span></span><span></span></div>').join('')}</div>`;
export function toast(message, error = false) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), error ? 8000 : 4500);
}
export function confirmAction(title, message, label = 'Confirm') {
  const dialog = document.getElementById('confirm-dialog');
  dialog.innerHTML = `<form method="dialog"><span class="eyebrow">A QUICK CHECK</span><h2>${escape(title)}</h2><p>${escape(message)}</p><div class="dialog-buttons"><button class="button secondary" value="cancel">Cancel</button><button class="button primary" value="confirm">${escape(label)}</button></div></form>`;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    }),
  );
}
