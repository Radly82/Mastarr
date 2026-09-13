const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const names = ['sonarr', 'radarr', 'sabnzbd'];
const numeric = (value) =>
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const identifier = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const dateString = (value) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
function blockedAddress(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    /^(169\.254\.|0\.|224\.|239\.|255\.)/.test(ip) ||
    ip === '100.100.100.200' ||
    /^(fe[89ab]|ff|fd00:ec2)/.test(ip) ||
    /^(::ffff:|::)(?:169\.254\.|a9fe:|0:)/.test(ip) ||
    ip === '::' ||
    ip === 'metadata.google.internal'
  );
}
function serviceUrl(input) {
  if (typeof input !== 'string' || input.length > 500) throw fail('Enter a valid service URL.');
  if (!input.trim()) return '';
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw fail('Enter a complete http:// or https:// service URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    blockedAddress(url.hostname)
  )
    throw fail('Service URLs cannot contain credentials, query strings, or metadata addresses.');
  return url.href.replace(/\/+$/, '');
}
function validateSettings(body, current) {
  if (!object(body) || !object(body.services))
    throw fail('A services configuration object is required.');
  const result = structuredClone(current);
  for (const [name, patch] of Object.entries(body.services)) {
    if (!names.includes(name) || !object(patch)) throw fail('Unknown or invalid service.');
    const allowed = [
      'url',
      'fallbackUrl',
      'apiKey',
      'enabled',
      'defaultRootFolder',
      'defaultQualityProfileId',
    ];
    if (Object.keys(patch).some((key) => !allowed.includes(key)))
      throw fail('Unknown service setting.');
    const service = result[name] || { enabled: false };
    for (const field of ['url', 'fallbackUrl'])
      if (field in patch) service[field] = serviceUrl(patch[field]);
    if ('apiKey' in patch) {
      if (
        typeof patch.apiKey !== 'string' ||
        patch.apiKey.length > 512 ||
        /[\r\n]/.test(patch.apiKey)
      )
        throw fail('Invalid API key.');
      if (patch.apiKey.trim()) service.apiKey = patch.apiKey.trim();
    }
    if ('enabled' in patch) {
      if (typeof patch.enabled !== 'boolean') throw fail('Enabled must be a boolean.');
      service.enabled = patch.enabled;
    }
    if ('defaultRootFolder' in patch) {
      if (typeof patch.defaultRootFolder !== 'string' || patch.defaultRootFolder.length > 1000)
        throw fail('Invalid root folder.');
      service.defaultRootFolder = patch.defaultRootFolder;
    }
    if ('defaultQualityProfileId' in patch) {
      if (!Number.isSafeInteger(patch.defaultQualityProfileId) || patch.defaultQualityProfileId < 0)
        throw fail('Invalid quality profile.');
      service.defaultQualityProfileId = patch.defaultQualityProfileId;
    }
    if (service.enabled && (!service.url || !service.apiKey))
      throw fail('Enabled services need a URL and API key.');
    result[name] = service;
  }
  return result;
}
function request(
  url,
  { method = 'GET', headers = {}, body, binary = false, timeout = 10000 } = {},
) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (blockedAddress(target.hostname))
      return reject(fail('This network destination is not allowed.'));
    const options = {
      method,
      headers,
      servername: net.isIP(target.hostname.replace(/^\[|\]$/g, '')) ? undefined : target.hostname,
      lookup(hostname, opts, callback) {
        dns
          .lookup(hostname, { all: true })
          .then((addresses) => {
            if (!addresses.length || addresses.some((item) => blockedAddress(item.address)))
              return callback(fail('This network destination is not allowed.'));
            const matches = opts.family
              ? addresses.filter((item) => item.family === opts.family)
              : addresses;
            if (!matches.length) return callback(fail('No compatible network address.'));
            if (opts.all) callback(null, matches);
            else callback(null, matches[0].address, matches[0].family);
          })
          .catch(callback);
      },
    };
    const req = (target.protocol === 'https:' ? https : http).request(target, options, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          req.destroy();
          reject(fail('Service response exceeded the size limit.', 502));
        } else chunks.push(chunk);
      });
      res.on('error', () => reject(fail('Service response was interrupted.', 502)));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300)
          return reject(
            fail(
              res.statusCode === 401 || res.statusCode === 403
                ? 'Service rejected authentication. Check its API key.'
                : `Service returned HTTP ${res.statusCode}.`,
              502,
            ),
          );
        const buffer = Buffer.concat(chunks);
        if (binary)
          return resolve({ buffer, type: String(res.headers['content-type'] || '').split(';')[0] });
        if (!buffer.length) return resolve({});
        try {
          resolve(JSON.parse(buffer.toString()));
        } catch {
          reject(fail('Service returned an invalid JSON response.', 502));
        }
      });
    });
    const timer = setTimeout(
      () =>
        req.destroy(
          fail('Service timed out. For write actions, check Activity before trying again.', 504),
        ),
      timeout,
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', (error) =>
      reject(
        error.status
          ? error
          : fail('Cannot reach the service. Check its address and Docker network.', 502),
      ),
    );
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

class Services {
  constructor(store, transport = request) {
    this.store = store;
    this.transport = transport;
    this.cache = new Map();
    this.artwork = new Map();
    this.preferred = new Map();
  }
  enabled(name) {
    const s = this.store.services()[name];
    return !!(s?.enabled && s.url && s.apiKey);
  }
  invalidate() {
    this.cache.clear();
    this.preferred.clear();
  }
  async cached(key, task, ttl = 15000) {
    const old = this.cache.get(key);
    if (old && old.until > Date.now()) return old.promise;
    if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value);
    const promise = Promise.resolve()
      .then(task)
      .catch((error) => {
        if (this.cache.get(key)?.promise === promise) this.cache.delete(key);
        throw error;
      });
    this.cache.set(key, { until: Date.now() + ttl, promise });
    return promise;
  }
  async call(name, endpoint, method = 'GET', body, configured) {
    const config = configured || this.store.services()[name];
    if (!config?.url || !config?.apiKey || (!configured && !config.enabled))
      throw fail(`${name} is not configured.`, 503);
    const urls = [...new Set([config.url, config.fallbackUrl].filter(Boolean))];
    const preferred = this.preferred.get(name);
    if (preferred && urls.includes(preferred))
      urls.sort((a, b) => Number(b === preferred) - Number(a === preferred));
    let error;
    for (const base of urls) {
      try {
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
        let address = base + endpoint;
        if (name === 'sabnzbd')
          address += `${address.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(config.apiKey)}`;
        else headers['X-Api-Key'] = config.apiKey;
        const result = await this.transport(address, { method, headers, body });
        this.preferred.set(name, base);
        return result;
      } catch (caught) {
        error = caught;
        if (method !== 'GET') break;
      }
    }
    throw error;
  }
  async many(task, selected = names) {
    const enabled = selected.filter((name) => this.enabled(name));
    const settled = await Promise.allSettled(enabled.map((name) => task(name)));
    return {
      values: settled.flatMap((r, i) =>
        r.status === 'fulfilled' ? [{ service: enabled[i], data: r.value }] : [],
      ),
      errors: settled.flatMap((r, i) =>
        r.status === 'rejected' ? [{ service: enabled[i], message: r.reason.message }] : [],
      ),
    };
  }
  art(name, image) {
    if (!image) return '';
    const source = image.remoteUrl || image.url;
    if (typeof source !== 'string') return '';
    let record;
    if (
      /^\/(?:MediaCover|api\/v3\/mediacover)\/[a-zA-Z0-9/_.-]+$/i.test(source) &&
      !source.includes('..')
    )
      record = { service: name, path: source };
    else {
      try {
        const url = new URL(source);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          !['image.tmdb.org', 'artworks.thetvdb.com'].includes(url.hostname)
        )
          return '';
        record = { url: url.href };
      } catch {
        return '';
      }
    }
    const key = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
    if (this.artwork.size > 10000) this.artwork.delete(this.artwork.keys().next().value);
    this.artwork.set(key, record);
    return `/api/art/${key}`;
  }
  media(name, item) {
    const series = name === 'sonarr';
    const stats = item.statistics || {};
    const files = series ? numeric(stats.episodeFileCount) : Number(item.hasFile === true);
    const episodes = series ? numeric(stats.episodeCount || stats.totalEpisodeCount) : 1;
    const ratings = item.ratings?.imdb || item.ratings?.tmdb || item.ratings;
    return {
      id: identifier(item.id) || null,
      service: name,
      type: series ? 'series' : 'movie',
      externalId: identifier(series ? item.tvdbId : item.tmdbId),
      title: String(item.title || item.seriesName || 'Untitled'),
      year: identifier(item.year) || null,
      overview: String(item.overview || ''),
      genres: Array.isArray(item.genres) ? item.genres.map(String) : [],
      runtime: numeric(item.runtime),
      rating: numeric(ratings?.value),
      monitored: item.monitored === true,
      qualityProfileId: identifier(item.qualityProfileId),
      status:
        item.hasFile || (series && files > 0 && files >= episodes)
          ? 'available'
          : files
            ? 'partial'
            : 'missing',
      releaseStatus: String(item.status || ''),
      added: dateString(item.added),
      size: numeric(stats.sizeOnDisk || item.sizeOnDisk || item.movieFile?.size),
      quality: item.movieFile?.quality?.quality?.name || '',
      episodeCount: episodes,
      episodeFileCount: files,
      seasonCount: item.seasons?.filter((s) => s.seasonNumber > 0).length || 0,
      poster: this.art(
        name,
        item.images?.find((i) => i.coverType === 'poster'),
      ),
      backdrop: this.art(
        name,
        item.images?.find((i) => i.coverType === 'fanart'),
      ),
      releaseDate:
        item.digitalRelease || item.physicalRelease || item.inCinemas || item.firstAired || '',
      tags: item.tags || [],
    };
  }
  async library() {
    return this.cached('library', async () => {
      const result = await this.many(
        (name) => this.call(name, `/api/v3/${name === 'sonarr' ? 'series' : 'movie'}`),
        ['sonarr', 'radarr'],
      );
      return {
        items: result.values.flatMap(({ service, data }) =>
          (Array.isArray(data) ? data : []).map((item) => this.media(service, item)),
        ),
        errors: result.errors,
        updatedAt: new Date().toISOString(),
      };
    });
  }
  async search(query) {
    const result = await this.many(
      (name) =>
        this.cached(
          `search:${name}:${query}`,
          () =>
            this.call(
              name,
              `/api/v3/${name === 'sonarr' ? 'series' : 'movie'}/lookup?term=${encodeURIComponent(query)}`,
            ),
          60000,
        ),
      ['sonarr', 'radarr'],
    );
    const library = await this.library();
    return {
      items: result.values.flatMap(({ service, data }) =>
        (Array.isArray(data) ? data : []).slice(0, 100).map((item) => {
          const normal = this.media(service, item);
          const existing = library.items.find(
            (m) => m.service === service && m.externalId === normal.externalId,
          );
          return existing || { ...normal, id: null, status: 'untracked' };
        }),
      ),
      errors: result.errors,
    };
  }
  async options(name) {
    return this.cached(
      `options:${name}`,
      async () => {
        const [profiles, roots, tags] = await Promise.all([
          this.call(name, '/api/v3/qualityprofile'),
          this.call(name, '/api/v3/rootfolder'),
          this.call(name, '/api/v3/tag'),
        ]);
        return {
          profiles: profiles
            .map((p) => ({ id: identifier(p.id), name: String(p.name) }))
            .filter((p) => p.id),
          roots: roots.map((r) => ({
            id: identifier(r.id),
            path: String(r.path),
            freeSpace: numeric(r.freeSpace),
          })),
          tags: tags.map((t) => ({ id: identifier(t.id), label: String(t.label) })),
          defaultRootFolder: this.store.services()[name]?.defaultRootFolder || '',
          defaultQualityProfileId: this.store.services()[name]?.defaultQualityProfileId || 0,
        };
      },
      60000,
    );
  }
  async health() {
    const result = await this.many(async (name) => {
      const started = Date.now();
      if (name === 'sabnzbd') {
        const status = await this.call(name, '/api?mode=version&output=json');
        return { version: status.version, latency: Date.now() - started, warnings: [] };
      }
      const [status, warnings, disks] = await Promise.all([
        this.call(name, '/api/v3/system/status'),
        this.call(name, '/api/v3/health'),
        this.call(name, '/api/v3/diskspace'),
      ]);
      return {
        version: status.version,
        latency: Date.now() - started,
        warnings: warnings.map((w) => ({ type: w.type, message: w.message })),
        disks: disks.map((d) => ({
          label: d.label || d.type || 'Storage',
          freeSpace: numeric(d.freeSpace),
          totalSpace: numeric(d.totalSpace),
        })),
      };
    });
    return {
      services: names.map((name) => {
        const ok = result.values.find((r) => r.service === name);
        const error = result.errors.find((r) => r.service === name);
        return {
          name,
          status: ok ? 'online' : error ? 'offline' : 'unconfigured',
          ...ok?.data,
          error: error?.message,
        };
      }),
    };
  }
  async detail(name, id) {
    const item = await this.call(name, `/api/v3/${name === 'sonarr' ? 'series' : 'movie'}/${id}`);
    const [episodes, history] = await Promise.all([
      name === 'sonarr' ? this.call(name, `/api/v3/episode?seriesId=${id}`) : [],
      this.call(
        name,
        `/api/v3/history?${name === 'sonarr' ? 'seriesIds' : 'movieIds'}=${id}&pageSize=15&sortKey=date&sortDirection=descending`,
      ).catch(() => ({ records: [] })),
    ]);
    return {
      ...this.media(name, item),
      rootFolderPath: item.rootFolderPath || '',
      seasons: (item.seasons || []).map((s) => ({
        number: numeric(s.seasonNumber),
        monitored: s.monitored,
      })),
      episodes: episodes.map((e) => ({
        id: identifier(e.id),
        season: numeric(e.seasonNumber),
        number: numeric(e.episodeNumber),
        title: e.title,
        airDate: e.airDateUtc,
        hasFile: e.hasFile,
        monitored: e.monitored,
      })),
      history: (history.records || []).map((h) => ({
        id: h.id,
        date: h.date,
        event: h.eventType,
        title: h.sourceTitle,
        quality: h.quality?.quality?.name || '',
      })),
    };
  }
  async calendar(start, end) {
    return this.cached(
      `calendar:${start}:${end}`,
      async () => {
        const result = await this.many(
          (name) =>
            this.call(
              name,
              `/api/v3/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&includeSeries=true&includeUnmonitored=false`,
            ),
          ['sonarr', 'radarr'],
        );
        const library = await this.library();
        return {
          items: result.values
            .flatMap(({ service, data }) =>
              (Array.isArray(data) ? data : []).map((item) => {
                const series = service === 'sonarr';
                const media = series
                  ? library.items.find((m) => m.service === service && m.id === item.seriesId)
                  : this.media(service, item);
                return {
                  ...media,
                  eventId: `${service}:${item.id}`,
                  date: series
                    ? item.airDateUtc || item.airDate
                    : item.digitalRelease || item.physicalRelease || item.inCinemas,
                  episodeTitle: series ? item.title : '',
                  episodeNumber: numeric(item.episodeNumber),
                  seasonNumber: numeric(item.seasonNumber),
                  hasFile: item.hasFile,
                  releaseType: series
                    ? 'Episode'
                    : item.digitalRelease
                      ? 'Digital release'
                      : item.physicalRelease
                        ? 'Physical release'
                        : 'In cinemas',
                };
              }),
            )
            .filter((item) => item.date)
            .sort((a, b) => a.date.localeCompare(b.date)),
          errors: result.errors,
        };
      },
      60000,
    );
  }
  async activity() {
    return this.cached(
      'activity',
      async () => {
        const result = await this.many(async (name) => {
          if (name === 'sabnzbd') {
            const [queue, history] = await Promise.all([
              this.call(name, '/api?mode=queue&output=json&limit=100'),
              this.call(name, '/api?mode=history&output=json&limit=30'),
            ]);
            return {
              queue: (queue.queue?.slots || []).map((s) => ({
                id: s.nzo_id,
                title: s.filename,
                status: s.status,
                progress: Number(s.percentage || 0),
                size: Number(s.mb || 0) * 1048576,
                eta: s.timeleft,
                service: name,
              })),
              history: (history.history?.slots || []).map((s) => ({
                id: s.nzo_id,
                title: s.name,
                status: s.status,
                size: s.size,
                date: new Date((s.completed || 0) * 1000).toISOString(),
                service: name,
              })),
              speed: Number(queue.queue?.kbpersec || 0) * 1024,
              paused: !!queue.queue?.paused,
            };
          }
          const queue = await this.call(
            name,
            '/api/v3/queue?pageSize=100&includeUnknownSeriesItems=true&includeUnknownMovieItems=true',
          );
          return {
            queue: (queue.records || []).map((q) => ({
              id: identifier(q.id),
              title: q.title,
              service: name,
              status: q.trackedDownloadStatus === 'warning' ? 'warning' : q.status,
              stage: q.trackedDownloadState,
              progress: q.size ? Math.max(0, Math.min(100, (1 - q.sizeleft / q.size) * 100)) : 0,
              size: q.size,
              eta: q.timeleft,
              messages: (q.statusMessages || []).flatMap((m) => m.messages || []),
              mediaId: q.seriesId || q.movieId,
              downloadId: q.downloadId,
            })),
            history: [],
          };
        });
        const rows = result.values.flatMap((r) => r.data.queue);
        const managed = rows.filter((r) => r.service !== 'sabnzbd');
        const clients = rows.filter((r) => r.service === 'sabnzbd');
        const queue = managed.map((row) => {
          const client = clients.find(
            (c) => String(c.id).toLowerCase() === String(row.downloadId).toLowerCase(),
          );
          return client
            ? {
                ...row,
                client: { id: client.id, service: 'sabnzbd' },
                progress: client.progress,
                eta: client.eta,
                status: client.status.toLowerCase() === 'paused' ? 'paused' : row.status,
              }
            : row;
        });
        queue.push(
          ...clients.filter(
            (c) =>
              !managed.some(
                (r) => String(r.downloadId).toLowerCase() === String(c.id).toLowerCase(),
              ),
          ),
        );
        return {
          queue,
          history: result.values
            .flatMap((r) => r.data.history)
            .sort((a, b) => b.date.localeCompare(a.date)),
          speed: result.values.reduce((sum, r) => sum + (r.data.speed || 0), 0),
          paused: result.values.some((r) => r.data.paused),
          errors: result.errors,
        };
      },
      5000,
    );
  }
  async add(name, data) {
    const externalId = Number(data.externalId);
    if (!Number.isSafeInteger(externalId) || externalId < 1)
      throw fail('A valid media identifier is required.');
    const endpoint = name === 'sonarr' ? 'series' : 'movie';
    const existing = await this.call(name, `/api/v3/${endpoint}`);
    if (existing.some((m) => (name === 'sonarr' ? m.tvdbId : m.tmdbId) === externalId))
      throw fail('This title is already in your library.', 409);
    const [matches, options] = await Promise.all([
      this.call(
        name,
        `/api/v3/${endpoint}/lookup?term=${name === 'sonarr' ? 'tvdb' : 'tmdb'}:${externalId}`,
      ),
      this.options(name),
    ]);
    const item = matches.find((m) => (name === 'sonarr' ? m.tvdbId : m.tmdbId) === externalId);
    if (!item) throw fail('The selected title could not be resolved.', 404);
    if (
      !options.profiles.some((p) => p.id === data.qualityProfileId) ||
      !options.roots.some((r) => r.path === data.rootFolderPath)
    )
      throw fail('Choose a valid quality profile and root folder.');
    if (
      !['all', 'future', 'none'].includes(data.monitor || 'all') ||
      typeof data.searchNow !== 'boolean'
    )
      throw fail('Invalid monitoring or search options.');
    const payload = {
      ...item,
      qualityProfileId: data.qualityProfileId,
      rootFolderPath: data.rootFolderPath,
      monitored: data.monitor !== 'none',
      tags: [],
      addOptions:
        name === 'sonarr'
          ? { searchForMissingEpisodes: data.searchNow, monitor: data.monitor || 'all' }
          : { searchForMovie: data.searchNow },
      minimumAvailability: 'released',
    };
    delete payload.id;
    delete payload.movieFile;
    delete payload.hasFile;
    if (name === 'sonarr') {
      payload.seasonFolder = true;
      payload.seasons = (item.seasons || []).map((s) => ({
        ...s,
        monitored: data.monitor !== 'none' && s.seasonNumber > 0,
      }));
    }
    const result = await this.call(name, `/api/v3/${endpoint}`, 'POST', payload);
    this.invalidate();
    return this.media(name, result);
  }
  async update(name, id, data) {
    const endpoint = name === 'sonarr' ? 'series' : 'movie';
    const item = await this.call(name, `/api/v3/${endpoint}/${id}`);
    if (typeof data.monitored === 'boolean') item.monitored = data.monitored;
    if (data.qualityProfileId !== undefined) {
      const options = await this.options(name);
      if (!options.profiles.some((p) => p.id === data.qualityProfileId))
        throw fail('Choose a valid quality profile.');
      item.qualityProfileId = data.qualityProfileId;
    }
    if (data.seasons !== undefined) {
      if (
        name !== 'sonarr' ||
        !Array.isArray(data.seasons) ||
        data.seasons.some(
          (s) => !Number.isSafeInteger(s.number) || typeof s.monitored !== 'boolean',
        )
      )
        throw fail('Invalid season selection.');
      item.seasons = item.seasons.map((s) => ({
        ...s,
        monitored: data.seasons.find((p) => p.number === s.seasonNumber)?.monitored ?? s.monitored,
      }));
    }
    const result = await this.call(name, `/api/v3/${endpoint}/${id}`, 'PUT', item);
    this.invalidate();
    return this.media(name, result);
  }
  async command(name, id, action) {
    const commands =
      name === 'sonarr'
        ? {
            search: { name: 'SeriesSearch', seriesId: id },
            refresh: { name: 'RefreshSeries', seriesId: id },
            missing: { name: 'MissingEpisodeSearch', seriesId: id },
          }
        : {
            search: { name: 'MoviesSearch', movieIds: [id] },
            refresh: { name: 'RefreshMovie', movieIds: [id] },
            missing: { name: 'MoviesSearch', movieIds: [id] },
          };
    if (!commands[action]) throw fail('Unknown action.');
    const response = await this.call(name, '/api/v3/command', 'POST', commands[action]);
    this.invalidate();
    return { id: response.id, status: response.status || 'queued' };
  }
  async releases(name, id, episodeId) {
    if (name === 'sonarr' && !episodeId) throw fail('Choose an episode to search for releases.');
    if (name === 'sonarr') {
      const episode = await this.call(name, `/api/v3/episode/${episodeId}`);
      if (episode.seriesId !== id) throw fail('Episode does not belong to this series.');
    }
    const releases = await this.call(
      name,
      `/api/v3/release?${name === 'sonarr' ? `episodeId=${episodeId}` : `movieId=${id}`}`,
    );
    return releases.map((r) => ({
      guid: r.guid,
      indexerId: r.indexerId,
      title: r.title,
      indexer: r.indexer,
      size: r.size,
      quality: r.quality?.quality?.name || '',
      protocol: r.protocol,
      age: r.age,
      rejected: !!r.rejected,
      rejections: r.rejections || [],
      seeders: r.seeders,
      languages: r.languages?.map((l) => l.name) || [],
    }));
  }
  async grab(name, id, data) {
    if (
      typeof data.guid !== 'string' ||
      data.guid.length > 2048 ||
      !Number.isSafeInteger(data.indexerId)
    )
      throw fail('Invalid release.');
    const releases = await this.releases(name, id, data.episodeId);
    const selected = releases.find((r) => r.guid === data.guid && r.indexerId === data.indexerId);
    if (!selected) throw fail('Release is no longer available. Refresh the search.');
    if (selected.rejected && data.confirmRejected !== true)
      throw fail('Confirm the rejected-release warning before grabbing.');
    const response = await this.call(name, '/api/v3/release', 'POST', {
      guid: data.guid,
      indexerId: data.indexerId,
    });
    this.invalidate();
    return { accepted: true, id: response.id };
  }
  async queueAction(name, id, action) {
    if (!this.enabled(name)) throw fail('Download service is not configured.', 503);
    if (name === 'sabnzbd') {
      if (!['pause', 'resume', 'retry'].includes(action) || !/^[\w-]{1,100}$/.test(id))
        throw fail('Invalid queue action.');
      const endpoint =
        action === 'retry'
          ? `/api?mode=retry&value=${encodeURIComponent(id)}&output=json`
          : `/api?mode=queue&name=${action}&value=${encodeURIComponent(id)}&output=json`;
      const config = this.store.services().sabnzbd;
      const base = this.preferred.get(name) || config.url;
      const result = await this.transport(
        `${base}${endpoint}&apikey=${encodeURIComponent(config.apiKey)}`,
        { method: 'GET' },
      );
      if (result.status === false || result.error)
        throw fail('The download client could not perform that action.', 502);
      this.invalidate();
      return { accepted: true };
    }
    if (action !== 'retry' || !/^\d+$/.test(id)) throw fail('This queue action is not supported.');
    await this.call(name, `/api/v3/queue/grab/${id}`, 'POST');
    this.invalidate();
    return { accepted: true };
  }
  async monitorEpisode(seriesId, data) {
    if (
      !Number.isSafeInteger(data.episodeId) ||
      data.episodeId < 1 ||
      typeof data.monitored !== 'boolean'
    )
      throw fail('Invalid episode monitoring action.');
    const episode = await this.call('sonarr', `/api/v3/episode/${data.episodeId}`);
    if (episode.seriesId !== seriesId) throw fail('Episode does not belong to this series.');
    await this.call('sonarr', '/api/v3/episode/monitor', 'PUT', {
      episodeIds: [data.episodeId],
      monitored: data.monitored,
    });
    this.invalidate();
    return { accepted: true };
  }
  async remove(name, id, data) {
    const endpoint = name === 'sonarr' ? 'series' : 'movie';
    const item = await this.call(name, `/api/v3/${endpoint}/${id}`);
    if (data.confirmation !== item.title || data.keepFiles !== true)
      throw fail('Confirm removal and retention of existing files.');
    await this.call(name, `/api/v3/${endpoint}/${id}?deleteFiles=false`, 'DELETE');
    this.invalidate();
    return { removed: true, filesPreserved: true };
  }
  async importCandidates(name, queueId, raw = false) {
    const queue = await this.call(
      name,
      '/api/v3/queue?pageSize=100&includeUnknownSeriesItems=true&includeUnknownMovieItems=true',
    );
    const item = (queue.records || []).find((q) => q.id === queueId);
    if (!item?.downloadId) throw fail('The tracked download is no longer in the queue.', 404);
    const candidates = await this.call(
      name,
      `/api/v3/manualimport?downloadId=${encodeURIComponent(item.downloadId)}&filterExistingFiles=true`,
    );
    if (raw) return { candidates, downloadId: item.downloadId };
    return candidates.map((c) => ({
      id: identifier(c.id),
      filename: String(c.path || '')
        .split(/[\\/]/)
        .pop(),
      title: c.movie?.title || c.series?.title || 'No media match',
      size: c.size || 0,
      quality: c.quality?.quality?.name || '',
      matched: name === 'radarr' ? !!c.movie?.id : !!(c.series?.id && c.episodes?.length),
      rejections: (c.rejections || []).map((r) => (typeof r === 'string' ? r : r.reason || r.type)),
    }));
  }
  async importFiles(name, queueId, data) {
    if (
      !Array.isArray(data.ids) ||
      !data.ids.length ||
      data.ids.length > 50 ||
      data.ids.some((id) => !Number.isSafeInteger(id))
    )
      throw fail('Select up to 50 recognized files to import.');
    const { candidates, downloadId } = await this.importCandidates(name, queueId, true);
    const chosen = [...new Set(data.ids)].map((id) => candidates.find((c) => c.id === id));
    if (
      chosen.some(
        (c) => !c || (name === 'radarr' ? !c.movie?.id : !(c.series?.id && c.episodes?.length)),
      )
    )
      throw fail('Some files no longer have a valid media match. Review them in the media engine.');
    if (chosen.some((c) => c.rejections?.length) && data.confirmRejected !== true)
      throw fail('Review and confirm import warnings first.');
    const files = chosen.map((c) => ({
      path: c.path,
      folderName: c.folderName,
      movieId: c.movie?.id,
      seriesId: c.series?.id,
      episodeIds: c.episodes?.map((e) => e.id),
      quality: c.quality,
      languages: c.languages,
      releaseGroup: c.releaseGroup,
      indexerFlags: c.indexerFlags,
      downloadId,
    }));
    const result = await this.call(name, '/api/v3/command', 'POST', {
      name: 'ManualImport',
      importMode: 'auto',
      files,
    });
    this.invalidate();
    return { id: result.id, status: result.status || 'queued' };
  }
  async image(key) {
    const art = this.artwork.get(key);
    if (!art) throw fail('Artwork expired. Refresh the library.', 404);
    const config = art.service && this.store.services()[art.service];
    const url = art.url || (this.preferred.get(art.service) || config.url) + art.path;
    const result = await this.transport(url, {
      binary: true,
      headers: art.service ? { 'X-Api-Key': config.apiKey } : {},
    });
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(result.type))
      throw fail('Unsupported artwork format.', 415);
    return result;
  }
}
module.exports = {
  Services,
  request,
  serviceUrl,
  validateSettings,
  blockedAddress,
  object,
  fail,
  names,
};
