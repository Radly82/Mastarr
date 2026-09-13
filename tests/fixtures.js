function createFixture() {
  const movie = {
    id: 1,
    tmdbId: 101,
    title: 'Fixture Movie',
    year: 2025,
    overview: 'A test movie from a simulated Radarr service.',
    genres: ['Science Fiction'],
    runtime: 120,
    hasFile: true,
    monitored: true,
    qualityProfileId: 2,
    rootFolderPath: '/media/movies',
    added: new Date().toISOString(),
    movieFile: { size: 4000000000, quality: { quality: { name: 'WEBDL-1080p' } } },
  };
  const series = {
    id: 2,
    tvdbId: 202,
    title: 'Fixture Series',
    year: 2025,
    overview: 'A test series from a simulated Sonarr service.',
    genres: ['Drama'],
    monitored: true,
    qualityProfileId: 2,
    seasons: [{ seasonNumber: 1, monitored: true }],
    statistics: { episodeCount: 2, episodeFileCount: 1 },
    added: new Date().toISOString(),
  };
  const movies = [movie];
  const shows = [series];
  const calls = [];
  const releases = [
    {
      guid: 'fixture-release-1',
      indexerId: 1,
      title: 'Fixture.Movie.1080p',
      indexer: 'Fixture indexer',
      quality: { quality: { name: 'WEBDL-1080p' } },
      size: 4000000000,
      protocol: 'usenet',
      rejected: false,
      rejections: [],
    },
  ];
  async function transport(address, options = {}) {
    const url = new URL(address);
    const pathname = url.pathname;
    const method = options.method || 'GET';
    const sonarr = url.hostname === 'sonarr';
    calls.push({ hostname: url.hostname, pathname, method, body: options.body });
    if (url.hostname === 'sabnzbd') {
      const mode = url.searchParams.get('mode');
      if (mode === 'version') return { version: '4.5.0' };
      if (mode === 'queue' && url.searchParams.has('name')) return { status: true };
      if (mode === 'queue')
        return {
          queue: {
            slots: [
              {
                nzo_id: 'download-1',
                filename: 'Fixture Movie',
                status: 'Downloading',
                percentage: '50',
                mb: '4000',
                timeleft: '00:02:00',
              },
            ],
            kbpersec: 2048,
          },
        };
      if (mode === 'history')
        return {
          history: {
            slots: [
              {
                nzo_id: 'history-1',
                name: 'Completed movie',
                status: 'Completed',
                size: '4 GB',
                completed: Math.floor(Date.now() / 1000),
              },
            ],
          },
        };
      return { status: true };
    }
    if (pathname === '/api/v3/system/status') return { version: sonarr ? '4.0.15' : '5.25.0' };
    if (pathname === '/api/v3/health') return [];
    if (pathname === '/api/v3/diskspace')
      return [{ label: 'Media', freeSpace: 100000000000, totalSpace: 1000000000000 }];
    if (pathname === '/api/v3/rootfolder')
      return [{ id: 1, path: sonarr ? '/media/tv' : '/media/movies', freeSpace: 100000000000 }];
    if (pathname === '/api/v3/qualityprofile')
      return [
        { id: 2, name: 'HD-1080p' },
        { id: 3, name: 'Ultra HD' },
      ];
    if (pathname === '/api/v3/tag') return [{ id: 1, label: 'Favorites' }];
    if (pathname.endsWith('/lookup')) {
      const term = url.searchParams.get('term') || '';
      const lookup = {
        ...(sonarr ? series : movie),
        id: undefined,
        tvdbId: sonarr ? 909 : undefined,
        tmdbId: sonarr ? undefined : 909,
        title: sonarr ? 'A New Series' : 'A New Movie',
        hasFile: false,
      };
      if (term.includes('909')) return [lookup];
      return [lookup, structuredClone(sonarr ? series : movie)];
    }
    if (pathname === '/api/v3/calendar')
      return sonarr
        ? [
            {
              id: 11,
              seriesId: 2,
              title: 'The Next Episode',
              airDateUtc: new Date(Date.now() + 86400000).toISOString(),
              seasonNumber: 1,
              episodeNumber: 2,
              hasFile: false,
            },
          ]
        : [{ ...movie, digitalRelease: new Date(Date.now() + 86400000).toISOString() }];
    if (pathname === '/api/v3/queue')
      return {
        records: sonarr
          ? []
          : [
              {
                id: 4,
                title: 'Fixture Movie',
                downloadId: 'download-1',
                movieId: 1,
                status: 'downloading',
                size: 4000000000,
                sizeleft: 2000000000,
                timeleft: '00:02:00',
                trackedDownloadState: 'downloading',
                statusMessages: [],
              },
            ],
      };
    if (pathname === '/api/v3/history')
      return {
        records: [
          {
            id: 1,
            date: new Date().toISOString(),
            eventType: 'downloadFolderImported',
            sourceTitle: 'Fixture import',
            quality: { quality: { name: 'HD-1080p' } },
          },
        ],
      };
    if (pathname === '/api/v3/episode')
      return [
        {
          id: 11,
          seriesId: 2,
          title: 'A New Beginning',
          seasonNumber: 1,
          episodeNumber: 1,
          hasFile: true,
          monitored: true,
        },
        {
          id: 12,
          seriesId: 2,
          title: 'The Next Episode',
          seasonNumber: 1,
          episodeNumber: 2,
          hasFile: false,
          monitored: true,
        },
      ];
    if (/^\/api\/v3\/episode\/\d+$/.test(pathname))
      return {
        id: Number(pathname.split('/').pop()),
        seriesId: 2,
        title: 'Episode',
        monitored: true,
      };
    if (pathname === '/api/v3/episode/monitor') return {};
    if (pathname === '/api/v3/release') return method === 'GET' ? releases : { id: 100 };
    if (pathname === '/api/v3/command') return { id: 99, status: 'queued' };
    if (pathname.startsWith('/api/v3/queue/grab/')) return {};
    if (pathname === '/api/v3/manualimport')
      return [
        {
          id: 1,
          path: '/downloads/fixture.mkv',
          folderName: 'fixture',
          series: sonarr ? series : undefined,
          movie: sonarr ? undefined : movie,
          episodes: sonarr ? [{ id: 12 }] : undefined,
          quality: { quality: { name: 'WEBDL-1080p' } },
          size: 4000000000,
          rejections: [],
        },
      ];
    const match = pathname.match(/^\/api\/v3\/(movie|series)(?:\/(\d+))?$/);
    if (match) {
      const collection = match[1] === 'movie' ? movies : shows;
      if (method === 'POST') {
        const item = { ...options.body, id: collection.length + 100 };
        collection.push(item);
        return structuredClone(item);
      }
      if (method === 'PUT') {
        const index = collection.findIndex((i) => i.id === Number(match[2]));
        collection[index] = structuredClone(options.body);
        return collection[index];
      }
      if (method === 'DELETE') {
        collection.splice(
          collection.findIndex((i) => i.id === Number(match[2])),
          1,
        );
        return {};
      }
      return structuredClone(
        match[2] ? collection.find((i) => i.id === Number(match[2])) : collection,
      );
    }
    throw new Error(`Unimplemented fixture endpoint: ${pathname}`);
  }
  return { movies, shows, calls, releases, transport };
}
module.exports = { createFixture };
