// ==================== CONFIGURATION ====================
// Load settings from localStorage or backend API
        async function loadConfig() {
            let settings = {};
            
            // Try backend API first (Docker mode)
            try {
                const response = await fetch('/api/settings');
                if (response.ok) {
                    settings = await response.json();
                    console.log('Loaded settings from backend API');
                } else {
                    throw new Error('Backend API not available');
                }
            } catch (error) {
                console.log('Backend API not available, using localStorage');
                // Fallback to localStorage
                try {
                    settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
                } catch (e) {
                    console.error('Error loading settings from localStorage:', e);
                    settings = {};
                }
            }
            
            return {
                sonarr: {
                    url: settings.sonarrUrl || '',
                    tailscaleUrl: settings.sonarrTailscaleUrl || '',
                    apiKey: settings.sonarrApiKey || '',
                    defaultRootFolder: settings.sonarrDefaultRootFolder || ''
                },
                radarr: {
                    url: settings.radarrUrl || '',
                    tailscaleUrl: settings.radarrTailscaleUrl || '',
                    apiKey: settings.radarrApiKey || '',
                    defaultRootFolder: settings.radarrDefaultRootFolder || ''
                },
                sabnzbd: {
                    url: settings.sabnzbdUrl || '',
                    tailscaleUrl: settings.sabnzbdTailscaleUrl || '',
                    apiKey: settings.sabnzbdApiKey || ''
                }
            };
        }

        // Save settings to backend API or localStorage
        async function saveConfig(settings) {
            // Try backend API first (Docker mode)
            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(settings)
                });
                if (response.ok) {
                    console.log('Saved settings to backend API');
                    return;
                }
                throw new Error('Backend API not available');
            } catch (error) {
                console.log('Backend API not available, using localStorage');
                // Fallback to localStorage
                localStorage.setItem('appSettings', JSON.stringify(settings));
            }
        }

        let config;
        let SONARR_CONFIG;
        let RADARR_CONFIG;
        let SABNZBD_CONFIG;
        let configReady = false;

        // Initialize config with error handling
        const configReadyPromise = loadConfig().then(loadedConfig => {
            config = loadedConfig;
            SONARR_CONFIG = {
                url: config.sonarr.url,
                tailscaleUrl: config.sonarr.tailscaleUrl,
                apiKey: config.sonarr.apiKey,
                defaultRootFolder: config.sonarr.defaultRootFolder
            };

            RADARR_CONFIG = {
                url: config.radarr.url,
                tailscaleUrl: config.radarr.tailscaleUrl,
                apiKey: config.radarr.apiKey,
                defaultRootFolder: config.radarr.defaultRootFolder
            };

            SABNZBD_CONFIG = {
                url: config.sabnzbd.url,
                tailscaleUrl: config.sabnzbd.tailscaleUrl,
                apiKey: config.sabnzbd.apiKey
            };

            configReady = true;

            // Load calendars after config is loaded
            loadCalendars();
            updateSabnzbdDownloads();
            updateDeckStats();
        }).catch(error => {
            console.error('Error loading config:', error);
            // Use empty config as fallback
            config = {
                sonarr: { url: '', tailscaleUrl: '', apiKey: '', defaultRootFolder: '' },
                radarr: { url: '', tailscaleUrl: '', apiKey: '', defaultRootFolder: '' },
                sabnzbd: { url: '', tailscaleUrl: '', apiKey: '' }
            };
            SONARR_CONFIG = config.sonarr;
            RADARR_CONFIG = config.radarr;
            SABNZBD_CONFIG = config.sabnzbd;
            configReady = true;
        });

        async function waitForConfig() {
            if (!configReady) {
                await configReadyPromise;
            }
        }

        function getServiceUrls(config) {
            return [config.url, config.tailscaleUrl].filter(Boolean);
        }

        async function fetchWithFallback(config, path, options) {
            const urls = getServiceUrls(config);
            if (urls.length === 0) throw new Error('No service URL configured');

            function fetchWithTimeout(baseUrl, timeoutMs) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                return fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal })
                    .then(response => {
                        clearTimeout(timer);
                        if (response.ok || response.status >= 400) {
                            response.baseUrl = baseUrl;
                            return response;
                        }
                        throw new Error(`HTTP ${response.status}`);
                    })
                    .catch(err => {
                        clearTimeout(timer);
                        throw err;
                    });
            }

            if (urls.length === 1) {
                return fetchWithTimeout(urls[0], 15000);
            }

            function raceUrls(timeoutMs) {
                return new Promise((resolve, reject) => {
                let errors = 0;
                const total = urls.length;
                urls.forEach(baseUrl => {
                    fetchWithTimeout(baseUrl, timeoutMs)
                        .then(resolve)
                        .catch(() => {
                            errors++;
                            if (errors === total) reject(new Error('All service URLs failed or timed out'));
                        });
                });
                });
            }

            try {
                return await raceUrls(5000);
            } catch (error) {
                return await raceUrls(15000);
            }
        }

        async function fetchJsonWithFallback(config, path, options) {
            const response = await fetchWithFallback(config, path, options);
            return await response.json();
        }

        function changeLayout(layout) {
            const html = document.documentElement;

            html.removeAttribute('data-layout');

            if (layout !== 'compact') {
                html.setAttribute('data-layout', layout);
            }

            localStorage.setItem('layout', layout);

            document.querySelectorAll('.layout-option').forEach(option => {
                option.classList.remove('selected');
                if (option.dataset.layout === layout) {
                    option.classList.add('selected');
                }
            });

            document.getElementById('mainDropdown').classList.remove('active');
        }
        
        function toggleMainDropdown() {
            const dropdown = document.getElementById('mainDropdown');
            dropdown.classList.toggle('active');
        }
        
        function toggleSubmenu(submenuId) {
            const submenu = document.getElementById(submenuId);
            const menuItem = submenu.previousElementSibling;
            
            // Close other submenus
            document.querySelectorAll('.submenu').forEach(sm => {
                if (sm.id !== submenuId) {
                    sm.classList.remove('active');
                    sm.previousElementSibling.classList.remove('active');
                }
            });
            
            // Toggle current submenu
            submenu.classList.toggle('active');
            menuItem.classList.toggle('active');
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const themeSelector = document.querySelector('.theme-selector');
            if (themeSelector && !themeSelector.contains(e.target)) {
                const mainDropdown = document.getElementById('mainDropdown');
                if (mainDropdown) {
                    mainDropdown.classList.remove('active');
                }
                document.querySelectorAll('.submenu').forEach(sm => sm.classList.remove('active'));
                document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
            }
        });

        // Load saved layout on page load
        function loadLayout() {
            const savedLayout = localStorage.getItem('layout') || 'cards';
            const html = document.documentElement;

            html.removeAttribute('data-layout');

            if (savedLayout !== 'compact') {
                html.setAttribute('data-layout', savedLayout);
            }

            document.querySelectorAll('.layout-option').forEach(option => {
                option.classList.remove('selected');
                if (option.dataset.layout === savedLayout) {
                    option.classList.add('selected');
                }
            });
        }

        // Initialize layout on page load
        document.addEventListener('DOMContentLoaded', loadLayout);

        // Results tab switching
        function switchResultsTab(tab) {
            const seriesTab = document.getElementById('seriesTab');
            const moviesTab = document.getElementById('moviesTab');
            const sonarrResults = document.getElementById('sonarrResults');
            const radarrResults = document.getElementById('radarrResults');

            if (tab === 'series') {
                seriesTab.classList.add('active');
                moviesTab.classList.remove('active');
                sonarrResults.style.display = 'block';
                radarrResults.style.display = 'none';
            } else {
                moviesTab.classList.add('active');
                seriesTab.classList.remove('active');
                radarrResults.style.display = 'block';
                sonarrResults.style.display = 'none';
            }
        }

        // Calendar functions
        async function fetchSonarrCalendar() {
            try {
                await waitForConfig();

                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                
                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/calendar?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}&apiKey=${SONARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Sonarr calendar API error');
                return await response.json();
            } catch (error) {
                console.error('Sonarr calendar error:', error);
                throw error;
            }
        }

        async function fetchRadarrCalendar() {
            try {
                await waitForConfig();

                const now = new Date();
                const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                
                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/calendar?start=${startDate.toISOString()}&end=${endDate.toISOString()}&apiKey=${RADARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Radarr calendar API error');
                return await response.json();
            } catch (error) {
                console.error('Radarr calendar error:', error);
                throw error;
            }
        }

        async function displaySonarrCalendar(items) {
            const container = document.getElementById('sonarrCalendar');
            if (!container) return;

            if (!items || items.length === 0) {
                container.innerHTML = '<div class="no-results">No upcoming episodes</div>';
                return;
            }

            // Filter out episodes that already have files (already downloaded)
            const upcomingEpisodes = items.filter(item => !item.hasFile);
            
            if (upcomingEpisodes.length === 0) {
                container.innerHTML = '<div class="no-results">No upcoming episodes</div>';
                return;
            }

            // Fetch series information for each unique seriesId
            const seriesIds = [...new Set(upcomingEpisodes.map(item => item.seriesId))];
            const seriesMap = new Map();
            
            for (const seriesId of seriesIds) {
                try {
                    const response = await fetchWithFallback(
                        SONARR_CONFIG,
                        `/api/v3/series/${seriesId}?apiKey=${SONARR_CONFIG.apiKey}`
                    );
                    if (response.ok) {
                        const series = await response.json();
                        seriesMap.set(seriesId, series.title);
                    }
                } catch (error) {
                    console.error('Error fetching series:', error);
                }
            }

            container.innerHTML = upcomingEpisodes.map(item => {
                const seriesTitle = seriesMap.get(item.seriesId) || 'Unknown';
                const airDate = item.airDateUtc || item.airDate;
                const dateStr = airDate ? new Date(airDate).toLocaleString() : 'Unknown date';
                const episodeTitle = item.title || 'Unknown';

                return `
                    <div class="calendar-item">
                        <div class="calendar-date">${dateStr}</div>
                        <div class="calendar-title">${seriesTitle}</div>
                        <div class="calendar-episode">${episodeTitle}</div>
                    </div>
                `;
            }).join('');
        }

        async function displayRadarrCalendar(items) {
            const container = document.getElementById('radarrCalendar');
            if (!container) return;

            if (!items || items.length === 0) {
                container.innerHTML = '<div class="no-results">No upcoming movies</div>';
                return;
            }

            const today = new Date();
            today.setHours(23, 59, 59, 999);
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            const upcomingMovies = items.filter(item => {
                if (!item.monitored || item.hasFile) return false;

                const status = String(item.status || '').toLowerCase();
                const releaseDates = [
                    item.digitalRelease,
                    item.physicalRelease,
                    item.inCinemas
                ].filter(Boolean);

                if (status && ['released', 'available'].includes(status)) {
                    return true;
                }

                return releaseDates.some(releaseDate => {
                    const date = new Date(releaseDate);
                    return date >= startOfMonth && date <= endOfMonth && date <= today;
                });
            });
            
            if (upcomingMovies.length === 0) {
                container.innerHTML = '<div class="no-results">No missing monitored movies</div>';
                return;
            }

            container.innerHTML = upcomingMovies.map(item => {
                const title = item.title || 'Unknown';
                const releaseDate = item.inCinemas || item.digitalRelease || item.physicalRelease;
                const dateStr = releaseDate ? new Date(releaseDate).toLocaleDateString() : 'Unknown date';
                const year = item.year || 'Unknown';

                return `
                    <div class="calendar-item">
                        <div class="calendar-date">${dateStr}</div>
                        <div class="calendar-title">${title}</div>
                        <div class="calendar-episode">${year}</div>
                    </div>
                `;
            }).join('');
        }

        async function loadCalendars() {
            try {
                const [sonarrCalendar, radarrCalendar] = await Promise.allSettled([
                    fetchSonarrCalendar(),
                    fetchRadarrCalendar()
                ]);

                if (sonarrCalendar.status === 'fulfilled') {
                    await displaySonarrCalendar(sonarrCalendar.value);
                } else {
                    const sEl = document.getElementById('sonarrCalendar');
                    if (sEl) sEl.innerHTML = '<div class="error">Failed to load Sonarr calendar</div>';
                }

                if (radarrCalendar.status === 'fulfilled') {
                    await displayRadarrCalendar(radarrCalendar.value);
                } else {
                    const rEl = document.getElementById('radarrCalendar');
                    if (rEl) rEl.innerHTML = '<div class="error">Failed to load Radarr calendar</div>';
                }
            } catch (error) {
                console.error('Error loading calendars:', error);
            }
        }

        // Load calendars on page load
        // document.addEventListener('DOMContentLoaded', loadCalendars);

        function toggleCalendar(calendarId) {
            const calendarList = document.getElementById(calendarId);
            const header = calendarList.previousElementSibling;
            
            calendarList.classList.toggle('collapsed');
            header.classList.toggle('collapsed');
        }

        async function searchSonarr(query) {
            try {
                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/series/lookup?term=${encodeURIComponent(query)}&limit=100&apiKey=${SONARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Sonarr API error');
                return await response.json();
            } catch (error) {
                console.error('Sonarr search error:', error);
                throw error;
            }
        }

        async function searchRadarr(query) {
            try {
                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/movie/lookup?term=${encodeURIComponent(query)}&limit=100&apiKey=${RADARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Radarr API error');
                return await response.json();
            } catch (error) {
                console.error('Radarr search error:', error);
                throw error;
            }
        }

        // Autocomplete functionality
        let autocompleteTimeout;
        let autocompleteResults = [];
        let selectedIndex = -1;

        function debounce(func, wait) {
            return function(...args) {
                clearTimeout(autocompleteTimeout);
                autocompleteTimeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        async function fetchAutocomplete(query) {
            if (query.length < 2) {
                hideAutocomplete();
                return;
            }

            try {
                await waitForConfig();

                const [sonarrResults, radarrResults] = await Promise.allSettled([
                    searchSonarr(query),
                    searchRadarr(query)
                ]);

                autocompleteResults = [];

                if (sonarrResults.status === 'fulfilled' && sonarrResults.value) {
                    sonarrResults.value.slice(0, 5).forEach(item => {
                        autocompleteResults.push({
                            title: item.title,
                            year: item.year,
                            type: 'series',
                            data: item
                        });
                    });
                }

                if (radarrResults.status === 'fulfilled' && radarrResults.value) {
                    radarrResults.value.slice(0, 5).forEach(item => {
                        autocompleteResults.push({
                            title: item.title,
                            year: item.year,
                            type: 'movie',
                            data: item
                        });
                    });
                }

                displayAutocomplete();
            } catch (error) {
                console.error('Autocomplete error:', error);
            }
        }

        function displayAutocomplete() {
            const dropdown = document.getElementById('autocompleteDropdown');
            const searchInput = document.getElementById('searchInput');

            if (!dropdown || !searchInput) return;

            if (autocompleteResults.length === 0) {
                hideAutocomplete();
                return;
            }

            // Position the fixed dropdown below the search input
            const inputRect = searchInput.getBoundingClientRect();
            dropdown.style.top = `${inputRect.bottom + 5}px`;
            dropdown.style.left = `${inputRect.left}px`;
            dropdown.style.width = `${inputRect.width}px`;

            dropdown.innerHTML = autocompleteResults.map((item, index) => `
                <div class="autocomplete-item ${index === selectedIndex ? 'selected' : ''}"
                     onclick="selectAutocompleteItem(${index})"
                     data-index="${index}">
                    <span class="autocomplete-item-title">${item.title}</span>
                    <span class="autocomplete-item-type">(${item.type === 'series' ? 'TV' : 'Movie'})</span>
                    ${item.year ? `<span class="autocomplete-item-year">${item.year}</span>` : ''}
                </div>
            `).join('');

            dropdown.classList.add('active');
        }

        function hideAutocomplete() {
            const dropdown = document.getElementById('autocompleteDropdown');
            if (!dropdown) return;
            dropdown.classList.remove('active');
            dropdown.innerHTML = '';
            autocompleteResults = [];
            selectedIndex = -1;
        }

        function selectAutocompleteItem(index) {
            const item = autocompleteResults[index];
            if (!item) return;

            document.getElementById('searchInput').value = item.title;
            hideAutocomplete();

            // Trigger search with the selected item
            if (item.type === 'series') {
                searchSonarr(item.title).then(results => {
                    displaySonarrResults(results);
                    document.getElementById('sonarrResults').style.display = 'block';
                    document.getElementById('radarrResults').style.display = 'none';
                    document.getElementById('seriesTab').classList.add('active');
                    document.getElementById('moviesTab').classList.remove('active');
                });
            } else {
                searchRadarr(item.title).then(results => {
                    displayRadarrResults(results);
                    document.getElementById('radarrResults').style.display = 'block';
                    document.getElementById('sonarrResults').style.display = 'none';
                    document.getElementById('moviesTab').classList.add('active');
                    document.getElementById('seriesTab').classList.remove('active');
                });
            }
        }

        const debouncedAutocomplete = debounce(fetchAutocomplete, 300);

        async function addSeries(series, customDirectory = null) {
            const btn = document.querySelector(`[data-id="sonarr-${series.tvdbId || series.title}"]`);
            if (!btn) return;
            
            btn.disabled = true;
            btn.textContent = 'Adding...';

            try {
                console.log('Adding series:', series.title);
                
                // Check if series already exists in library
                const existingSeries = await fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/series?apiKey=${SONARR_CONFIG.apiKey}`);
                const existing = existingSeries.find(s => s.tvdbId === series.tvdbId);
                
                if (existing) {
                    console.log('Series already in library:', existing.title);
                    btn.textContent = 'Already in Library';
                    btn.classList.add('error');
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = 'Add Series';
                        btn.classList.remove('error');
                    }, 2000);
                    return;
                }
                
                // First, fetch the root folders and quality profiles to get valid IDs
                const [rootFolders, qualityProfiles] = await Promise.all([
                    fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/rootfolder?apiKey=${SONARR_CONFIG.apiKey}`),
                    fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/qualityprofile?apiKey=${SONARR_CONFIG.apiKey}`)
                ]);

                console.log('Available root folders:', rootFolders);
                console.log('Available quality profiles:', qualityProfiles);

                // Use custom directory if provided, otherwise use configured default, otherwise use first available
                const rootFolder = customDirectory || SONARR_CONFIG.defaultRootFolder || rootFolders[0]?.path || '/tv';
                const qualityProfileId = qualityProfiles[0]?.id || 1;

                // Use the full series data from lookup and add required fields
                const seriesData = {
                    ...series,
                    qualityProfileId: qualityProfileId,
                    seasonFolder: true,
                    monitored: true,
                    rootFolderPath: rootFolder,
                    addOptions: {
                        searchForMissingEpisodes: true
                    }
                };

                // Remove fields that shouldn't be sent when adding
                delete seriesData.id;
                delete seriesData.seasons;

                console.log('Sending to Sonarr:', seriesData);

                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/series?apiKey=${SONARR_CONFIG.apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(seriesData)
                    }
                );

                console.log('Sonarr response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Sonarr error response:', errorText);
                    
                    // Check if error is because series already exists
                    if (errorText.includes('already been added') || errorText.includes('SeriesExistsValidator')) {
                        btn.textContent = 'Already in Library';
                        btn.classList.add('error');
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.textContent = 'Add to Sonarr';
                            btn.classList.remove('error');
                        }, 2000);
                        return;
                    }
                    
                    throw new Error(`Failed to add series: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log('Sonarr success response: Series added successfully');

                btn.textContent = 'Added! ✓';
                btn.classList.add('success');
            } catch (error) {
                console.error('Add series error:', error);
                btn.textContent = 'Failed - Try Again';
                btn.classList.add('error');
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = 'Add to Sonarr';
                    btn.classList.remove('error');
                }, 2000);
            }
        }

        async function addMovie(movie, customDirectory = null) {
            const btn = document.querySelector(`[data-id="radarr-${movie.tmdbId || movie.title}"]`);
            if (!btn) return;
            
            btn.disabled = true;
            btn.textContent = 'Adding...';

            try {
                console.log('Adding movie:', movie.title);
                
                // Check if movie already exists in library
                const existingMovies = await fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`);
                const existingMovie = existingMovies.find(m => m.tmdbId === movie.tmdbId);
                
                if (existingMovie) {
                    console.log('Movie already in library:', existingMovie.title);
                    btn.textContent = 'Already in Library';
                    btn.classList.add('error');
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = 'Add Movie';
                        btn.classList.remove('error');
                    }, 2000);
                    return;
                }
                
                // First, fetch the root folders and quality profiles to get valid IDs
                const [rootFolders, qualityProfiles] = await Promise.all([
                    fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/rootfolder?apiKey=${RADARR_CONFIG.apiKey}`),
                    fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/qualityprofile?apiKey=${RADARR_CONFIG.apiKey}`)
                ]);

                console.log('Available root folders:', rootFolders);
                console.log('Available quality profiles:', qualityProfiles);

                // Use custom directory if provided, otherwise use configured default, otherwise use first available
                const rootFolder = customDirectory || RADARR_CONFIG.defaultRootFolder || rootFolders[0]?.path || '/movies';
                const qualityProfileId = qualityProfiles[0]?.id || 1;

                // Use the full movie data from lookup and add required fields
                const movieData = {
                    ...movie,
                    qualityProfileId: qualityProfileId,
                    monitored: true,
                    rootFolderPath: rootFolder,
                    addOptions: {
                        searchForMovie: true
                    }
                };

                // Remove fields that shouldn't be sent when adding
                delete movieData.id;
                delete movieData.movieFile;
                delete movieData.hasFile;

                console.log('Sending to Radarr:', movieData);

                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(movieData)
                    }
                );

                console.log('Radarr response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Radarr error response:', errorText);
                    
                    // Check if error is because movie already exists
                    if (errorText.includes('already been added') || errorText.includes('MovieExistsValidator')) {
                        btn.textContent = 'Already in Library';
                        btn.classList.add('error');
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.textContent = 'Add to Radarr';
                            btn.classList.remove('error');
                        }, 2000);
                        return;
                    }
                    
                    throw new Error(`Failed to add movie: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log('Radarr success response: Movie added successfully');

                btn.textContent = 'Added! ✓';
                btn.classList.add('success');
            } catch (error) {
                console.error('Add movie error:', error);
                btn.textContent = 'Failed - Try Again';
                btn.classList.add('error');
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = 'Add to Radarr';
                    btn.classList.remove('error');
                }, 2000);
            }
        }

        // Modal-specific add functions that don't rely on UI button manipulation
        async function addMovieToRadarr(movie, customDirectory = null) {
            try {
                console.log('Adding movie to Radarr:', movie.title);
                
                // Check if movie already exists in library
                const existingMovies = await fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`);
                const existingMovie = existingMovies.find(m => m.tmdbId === movie.tmdbId);
                
                if (existingMovie) {
                    console.log('Movie already in library:', existingMovie.title);
                    throw new Error('Movie already in library');
                }
                
                // Fetch the root folders and quality profiles to get valid IDs
                const [rootFolders, qualityProfiles] = await Promise.all([
                    fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/rootfolder?apiKey=${RADARR_CONFIG.apiKey}`),
                    fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/qualityprofile?apiKey=${RADARR_CONFIG.apiKey}`)
                ]);

                console.log('Available root folders:', rootFolders);
                console.log('Available quality profiles:', qualityProfiles);

                // Use custom directory if provided, otherwise use configured default, otherwise use first available
                const rootFolder = customDirectory || RADARR_CONFIG.defaultRootFolder || rootFolders[0]?.path || '/movies';
                const qualityProfileId = qualityProfiles[0]?.id || 1;

                // Use the full movie data from lookup and add required fields
                const movieData = {
                    ...movie,
                    qualityProfileId: qualityProfileId,
                    monitored: true,
                    rootFolderPath: rootFolder,
                    addOptions: {
                        searchForMovie: true
                    }
                };

                // Remove fields that shouldn't be sent when adding
                delete movieData.id;
                delete movieData.movieFile;
                delete movieData.hasFile;

                console.log('Sending to Radarr:', movieData);

                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(movieData)
                    }
                );

                console.log('Radarr response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Radarr error response:', errorText);
                    
                    // Check if error is because movie already exists
                    if (response.status === 409 || errorText.includes('already been added') || errorText.includes('MovieExistsValidator')) {
                        console.log('Movie was already added (409 Conflict) - treating as success');
                        return { success: true, alreadyExists: true };
                    }
                    
                    throw new Error(`Failed to add movie: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log('Radarr success response: Movie added successfully');
                return result;
            } catch (error) {
                console.error('Add movie to Radarr error:', error);
                throw error;
            }
        }

        async function addSeriesToSonarr(series, customDirectory = null) {
            try {
                console.log('Adding series to Sonarr:', series.seriesName || series.title);
                
                // Check if series already exists in library
                const existingSeries = await fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/series?apiKey=${SONARR_CONFIG.apiKey}`);
                const existing = existingSeries.find(s => s.tvdbId === series.tvdbId);
                
                if (existing) {
                    console.log('Series already in library:', existing.title);
                    throw new Error('Series already in library');
                }
                
                // Fetch the root folders and quality profiles to get valid IDs
                const [rootFolders, qualityProfiles] = await Promise.all([
                    fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/rootfolder?apiKey=${SONARR_CONFIG.apiKey}`),
                    fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/qualityprofile?apiKey=${SONARR_CONFIG.apiKey}`)
                ]);

                console.log('Available root folders:', rootFolders);
                console.log('Available quality profiles:', qualityProfiles);

                // Use custom directory if provided, otherwise use configured default, otherwise use first available
                const rootFolder = customDirectory || SONARR_CONFIG.defaultRootFolder || rootFolders[0]?.path || '/tv';
                const qualityProfileId = qualityProfiles[0]?.id || 1;

                // Use the full series data from lookup and add required fields
                const seriesData = {
                    ...series,
                    qualityProfileId: qualityProfileId,
                    monitored: true,
                    rootFolderPath: rootFolder,
                    addOptions: {
                        searchForMissingEpisodes: true
                    }
                };

                // Remove fields that shouldn't be sent when adding
                delete seriesData.id;
                delete seriesData.seasons;

                console.log('Sending to Sonarr:', seriesData);

                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/series?apiKey=${SONARR_CONFIG.apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(seriesData)
                    }
                );

                console.log('Sonarr response status:', response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Sonarr error response:', errorText);
                    
                    // Check if error is because series already exists
                    if (response.status === 409 || errorText.includes('already been added') || errorText.includes('SeriesExistsValidator')) {
                        console.log('Series was already added (409 Conflict) - treating as success');
                        return { success: true, alreadyExists: true };
                    }
                    
                    throw new Error(`Failed to add series: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log('Sonarr success response: Series added successfully');
                return result;
            } catch (error) {
                console.error('Add series to Sonarr error:', error);
                throw error;
            }
        }

        // Track selected items for bulk add (Radarr only)
        let selectedRadarrItems = new Set();
        let radarrItemsMap = new Map(); // Store item data by id

        function displaySonarrResults(results) {
            const container = document.getElementById('sonarrResults');

            // Update count in tab if it exists
            const seriesCountEl = document.getElementById('seriesCount');
            if (seriesCountEl) {
                const seriesCount = results ? results.length : 0;
                seriesCountEl.textContent = `Series (${seriesCount})`;
            }

            if (!results || results.length === 0) {
                container.innerHTML = '<div class="no-results">No series found</div>';
                return;
            }

            container.innerHTML = results.map(item => {
                const seasonCount = item.seasons ? item.seasons.length : 0;

                return `
                <div class="result-item" onclick="showCover(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'sonarr')">
                    <div class="result-title">${item.title || 'Unknown'}</div>
                    <div class="result-year">${item.year ? `Year: ${item.year}` : ''} ${item.status ? `| Status: ${item.status}` : ''}</div>
                    ${seasonCount > 0 ? `<div class="result-stats">${seasonCount} Season${seasonCount > 1 ? 's' : ''}</div>` : ''}
                    ${item.overview ? `<div class="result-overview">${item.overview.substring(0, 200)}${item.overview.length > 200 ? '...' : ''}</div>` : ''}
                    <button class="download-btn" onclick="event.stopPropagation(); addSeries(${JSON.stringify(item).replace(/"/g, '&quot;')})" data-id="sonarr-${item.tvdbId || item.title}">Add Series</button>
                </div>
            `}).join('');
        }

        function displayRadarrResults(results) {
            const container = document.getElementById('radarrResults');

            // Update count in tab if it exists
            const moviesCountEl = document.getElementById('moviesCount');
            if (moviesCountEl) {
                const moviesCount = results ? results.length : 0;
                moviesCountEl.textContent = `Movies (${moviesCount})`;
            }

            if (!results || results.length === 0) {
                container.innerHTML = '<div class="no-results">No movies found</div>';
                return;
            }

            // Clear and repopulate the items map
            radarrItemsMap.clear();
            selectedRadarrItems.clear();
            results.forEach(item => {
                const id = String(item.tmdbId || item.title);
                radarrItemsMap.set(id, item);
            });

            console.log('Map keys:', Array.from(radarrItemsMap.keys()));

            container.innerHTML = results.map(item => {
                const id = String(item.tmdbId || item.title);
                return `
                <div class="result-item" onclick="showCover(${JSON.stringify(item).replace(/"/g, '&quot;')}, 'radarr')">
                    <div class="result-checkbox-wrapper">
                        <input type="checkbox" class="result-checkbox" data-type="radarr" data-id="${id}" onclick="event.stopPropagation(); toggleSelection('radarr', '${id}', this)">
                    </div>
                    <div class="result-content">
                        <div class="result-title">${item.title || 'Unknown'}</div>
                        <div class="result-year">${item.year ? `Year: ${item.year}` : ''} ${item.status ? `| Status: ${item.status}` : ''}</div>
                        ${item.overview ? `<div class="result-overview">${item.overview.substring(0, 200)}${item.overview.length > 200 ? '...' : ''}</div>` : ''}
                    </div>
                    <button class="download-btn radarr" onclick="handleRadarrButtonClick(${JSON.stringify(item).replace(/"/g, '&quot;')}, event)" data-id="radarr-${id}">Add Movie</button>
                </div>
            `}).join('');
            
            updateBulkAddButton();
        }

        function toggleSelection(type, id, checkbox) {
            const itemData = radarrItemsMap.get(id);
            
            if (type === 'radarr') {
                if (checkbox.checked) {
                    selectedRadarrItems.add(id);
                } else {
                    selectedRadarrItems.delete(id);
                }
            }
            
            updateBulkAddButton();
            updateRadarrButtonText();
        }

        function updateRadarrButtonText() {
            const radarrButtons = document.querySelectorAll('#radarrResults .download-btn.radarr');
            const text = selectedRadarrItems.size > 1 ? 'Add Multiple' : 'Add Movie';
            
            console.log('updateRadarrButtonText called, selected:', selectedRadarrItems.size, 'text:', text, 'buttons found:', radarrButtons.length);
            
            radarrButtons.forEach(btn => {
                console.log('Setting button text to:', text);
                btn.textContent = text;
            });
        }

        function updateBulkAddButton() {
            const radarrContainer = document.getElementById('radarrResults');
            
            // Add bulk add button for Radarr if items are selected
            let radarrBulkBtn = document.getElementById('radarrBulkAddBtn');
            if (selectedRadarrItems.size > 0) {
                if (!radarrBulkBtn) {
                    radarrBulkBtn = document.createElement('button');
                    radarrBulkBtn.id = 'radarrBulkAddBtn';
                    radarrBulkBtn.className = 'bulk-add-btn';
                    radarrBulkBtn.onclick = bulkAddRadarr;
                    radarrContainer.parentNode.insertBefore(radarrBulkBtn, radarrContainer.nextSibling);
                }
                radarrBulkBtn.textContent = `Add ${selectedRadarrItems.size} Movie${selectedRadarrItems.size > 1 ? 's' : ''} to Radarr`;
            } else if (radarrBulkBtn) {
                radarrBulkBtn.remove();
            }
        }

        async function handleRadarrButtonClick(movie, event) {
            event.stopPropagation();
            
            if (selectedRadarrItems.size > 1) {
                bulkAddRadarr();
            } else {
                addMovie(movie);
            }
        }

        async function bulkAddRadarr() {
            if (selectedRadarrItems.size === 0) return;
            
            const btn = document.getElementById('radarrBulkAddBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Adding...';
            }
            
            const items = Array.from(selectedRadarrItems)
                .map(id => ({ id, item: radarrItemsMap.get(id) }))
                .filter(({ id, item }) => {
                    if (!item) {
                        console.log('Skipping undefined item for id:', id);
                        return false;
                    }
                    return true;
                })
                .map(({ item }) => item);
            
            console.log('Items to add:', items.length, 'Selected IDs:', Array.from(selectedRadarrItems), 'Map size:', radarrItemsMap.size);
            
            if (items.length === 0) {
                console.error('No valid items to add. Map may have been cleared.');
                if (btn) {
                    btn.textContent = 'Error - Try again';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = `Add ${selectedRadarrItems.size} Movie${selectedRadarrItems.size > 1 ? 's' : ''} to Radarr`;
                    }, 2000);
                }
                return;
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (const movie of items) {
                try {
                    // Check if movie already exists
                    const existingMovies = await fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`);
                    const existing = existingMovies.find(m => m.tmdbId === movie.tmdbId);
                    
                    if (existing) {
                        failCount++;
                        continue;
                    }
                    
                    const [rootFolders, qualityProfiles] = await Promise.all([
                        fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/rootfolder?apiKey=${RADARR_CONFIG.apiKey}`),
                        fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/qualityprofile?apiKey=${RADARR_CONFIG.apiKey}`)
                    ]);
                    
                    const rootFolder = RADARR_CONFIG.defaultRootFolder || rootFolders[0]?.path || '/movies';
                    const qualityProfileId = qualityProfiles[0]?.id || 1;
                    
                    const movieData = {
                        ...movie,
                        qualityProfileId: qualityProfileId,
                        monitored: true,
                        rootFolderPath: rootFolder,
                        addOptions: {
                            searchForMovie: true
                        }
                    };
                    
                    delete movieData.id;
                    delete movieData.movieFile;
                    delete movieData.hasFile;
                    
                    const response = await fetchWithFallback(
                        RADARR_CONFIG,
                        `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(movieData)
                        }
                    );
                    
                    if (response.ok) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    console.error('Error adding movie:', error);
                    failCount++;
                }
            }
            
            btn.textContent = `Added ${successCount}, Failed ${failCount}`;
            btn.classList.add(successCount > 0 ? 'success' : 'error');
            
            setTimeout(() => {
                btn.disabled = false;
                selectedRadarrItems.clear();
                document.querySelectorAll('.result-checkbox[data-type="radarr"]').forEach(cb => cb.checked = false);
                updateBulkAddButton();
                updateRadarrButtonText();
            }, 3000);
        }

        function showError(message) {
            const container = document.getElementById('errorContainer');
            if (container) {
                container.innerHTML = `<div class="error">${message}</div>`;
            } else {
                console.error('Error:', message);
            }
        }

        function clearError() {
            const errorContainer = document.getElementById('errorContainer');
            if (errorContainer) {
                errorContainer.innerHTML = '';
            }
        }

        async function searchSonarr(query) {
            try {
                await waitForConfig();
                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/series/lookup?term=${encodeURIComponent(query)}&apiKey=${SONARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Sonarr search error');
                return await response.json();
            } catch (error) {
                console.error('Error searching Sonarr:', error);
                throw error;
            }
        }

        async function searchRadarr(query) {
            try {
                await waitForConfig();
                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/movie/lookup?term=${encodeURIComponent(query)}&apiKey=${RADARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Radarr search error');
                return await response.json();
            } catch (error) {
                console.error('Error searching Radarr:', error);
                throw error;
            }
        }

        async function searchBoth() {
            await waitForConfig();

            const query = document.getElementById('searchInput').value.trim();
            const searchBtn = document.getElementById('searchBtn');

            if (!query) {
                showError('Please enter a search term');
                return;
            }

            clearError();
            searchBtn.disabled = true;
            searchBtn.textContent = 'Searching...';

            // Always use the poster-style display functions for search results
            const sonarrRecent = document.getElementById('sonarrRecentSeries');
            const radarrRecent = document.getElementById('radarrRecentMovies');

            // Show searching messages in correct containers
            if (sonarrRecent) {
                sonarrRecent.innerHTML = '<div class="loading">Searching Sonarr...</div>';
            }
            if (radarrRecent) {
                radarrRecent.innerHTML = '<div class="loading">Searching Radarr...</div>';
            }

            try {
                const [sonarrResponse, radarrResponse] = await Promise.allSettled([
                    searchSonarr(query),
                    searchRadarr(query)
                ]);

                // Display Sonarr results in poster style
                if (sonarrResponse.status === 'fulfilled') {
                    if (sonarrRecent) {
                        sonarrRecent.innerHTML = '';
                        displayRecentSeriesSearchResults(sonarrResponse.value);
                    }
                } else {
                    if (sonarrRecent) {
                        sonarrRecent.innerHTML = '<div class="error">Failed to search Sonarr</div>';
                    }
                }

                // Display Radarr results in poster style
                if (radarrResponse.status === 'fulfilled') {
                    if (radarrRecent) {
                        radarrRecent.innerHTML = '';
                        displayRecentMoviesSearchResults(radarrResponse.value);
                    }
                } else {
                    if (radarrRecent) {
                        radarrRecent.innerHTML = '<div class="error">Failed to search Radarr</div>';
                    }
                }

            } catch (error) {
                showError('An unexpected error occurred during search');
                console.error(error);
            } finally {
                searchBtn.disabled = false;
                searchBtn.textContent = 'Search';
            }
        }

        // Allow Enter key to trigger search
        document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('searchInput');
            const searchBtn = document.getElementById('searchBtn');

            if (searchInput) {
                // Ensure input is always enabled
                searchInput.disabled = false;
                searchInput.readOnly = false;

                // Keyboard navigation
                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        searchBoth();
                    }
                });
            }

            // Add click event listener to search button
            if (searchBtn) {
                searchBtn.addEventListener('click', function() {
                    searchBoth();
                });
            }

            // Initialize collapsible calendar headers
            initCollapsibleCalendars();
        });

        function initCollapsibleCalendars() {
            const calendarHeaders = document.querySelectorAll('.calendar-header');
            calendarHeaders.forEach(header => {
                // Add collapse icon if not present
                if (!header.querySelector('.collapse-icon')) {
                    const collapseIcon = document.createElement('span');
                    collapseIcon.className = 'collapse-icon';
                    collapseIcon.innerHTML = '▼';
                    header.appendChild(collapseIcon);
                }

                header.addEventListener('click', function(e) {
                    // Don't collapse if clicking on a link or button inside the header
                    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;

                    const calendarList = this.nextElementSibling;
                    if (calendarList && calendarList.classList.contains('calendar-list')) {
                        this.classList.toggle('collapsed');
                        calendarList.classList.toggle('collapsed');
                    }
                });
            });
        }

        function copyDebugInfo() {
            const searchInput = document.getElementById('searchInput');
            const debugInfo = {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                searchInput: {
                    exists: !!searchInput,
                    disabled: searchInput ? searchInput.disabled : 'N/A',
                    readOnly: searchInput ? searchInput.readOnly : 'N/A',
                    value: searchInput ? searchInput.value : 'N/A',
                    focused: document.activeElement === searchInput
                },
                config: {
                    sonarrUrl: SONARR_CONFIG ? SONARR_CONFIG.url : 'Not loaded',
                    radarrUrl: RADARR_CONFIG ? RADARR_CONFIG.url : 'Not loaded',
                    sabnzbdUrl: SABNZBD_CONFIG ? SABNZBD_CONFIG.url : 'Not loaded',
                    sonarrApiKey: SONARR_CONFIG ? (SONARR_CONFIG.apiKey ? 'Present (' + SONARR_CONFIG.apiKey.length + ' chars)' : 'Missing') : 'Not loaded',
                    radarrApiKey: RADARR_CONFIG ? (RADARR_CONFIG.apiKey ? 'Present (' + RADARR_CONFIG.apiKey.length + ' chars)' : 'Missing') : 'Not loaded',
                    sabnzbdApiKey: SABNZBD_CONFIG ? (SABNZBD_CONFIG.apiKey ? 'Present (' + SABNZBD_CONFIG.apiKey.length + ' chars)' : 'Missing') : 'Not loaded'
                },
                electron: typeof window.electronAPI !== 'undefined',
                localStorage: {
                    appSettings: localStorage.getItem('appSettings') ? 'Present' : 'Missing'
                }
            };
            
            const debugString = JSON.stringify(debugInfo, null, 2);
            
            // Try clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(debugString).then(() => {
                    alert('Debug info copied to clipboard! Paste it here.');
                }).catch(err => {
                    console.error('Failed to copy debug info:', err);
                    showDebugInAlert(debugString);
                });
            } else {
                // Fallback: show in alert
                showDebugInAlert(debugString);
            }
        }

        function showDebugInAlert(debugString) {
            // Try to use Electron clipboard if available
            if (window.electronAPI && window.electronAPI.writeToClipboard) {
                window.electronAPI.writeToClipboard(debugString).then(() => {
                    alert('Debug info copied to clipboard! Paste it here.');
                }).catch(err => {
                    console.error('Failed to copy via Electron API:', err);
                    alert('Debug info:\n\n' + debugString);
                });
            } else {
                alert('Debug info:\n\n' + debugString);
            }
        }

        // Modal functions for cover art
        let currentModalItem = null;
        let currentModalType = null;

        async function checkLibraryStatus(item, type, statusElement, downloadBtn) {
            // Set initial checking state
            statusElement.textContent = 'Checking...';
            statusElement.className = 'modal-library-status not-in-library';
            downloadBtn.disabled = true;
            downloadBtn.textContent = 'Please wait...';

            try {
                let isInLibrary = false;
                const title = (item.title || item.seriesName || '').toLowerCase().trim();
                const year = item.year;

                if (type === 'radarr') {
                    const movies = await fetchJsonWithFallback(RADARR_CONFIG, `/api/v3/movie?apiKey=${RADARR_CONFIG.apiKey}`);
                    
                    // Check by tmdbId first (most reliable)
                    if (item.tmdbId) {
                        isInLibrary = movies.some(m => m.tmdbId === item.tmdbId);
                    }
                    
                    // Fallback: check by title and year if tmdbId check failed
                    if (!isInLibrary && title && year) {
                        isInLibrary = movies.some(m => {
                            const movieTitle = (m.title || '').toLowerCase().trim();
                            const movieYear = m.year;
                            return movieTitle === title && movieYear === year;
                        });
                    }
                } else if (type === 'sonarr') {
                    const series = await fetchJsonWithFallback(SONARR_CONFIG, `/api/v3/series?apiKey=${SONARR_CONFIG.apiKey}`);
                    
                    // Check by tvdbId first (most reliable)
                    if (item.tvdbId) {
                        isInLibrary = series.some(s => s.tvdbId === item.tvdbId);
                    }
                    
                    // Fallback: check by title and year if tvdbId check failed
                    if (!isInLibrary && title && year) {
                        isInLibrary = series.some(s => {
                            const seriesTitle = (s.title || '').toLowerCase().trim();
                            const seriesYear = s.year;
                            return seriesTitle === title && seriesYear === year;
                        });
                    }
                }
                
                if (isInLibrary) {
                    statusElement.textContent = '✓ In Library';
                    statusElement.className = 'modal-library-status in-library';
                    downloadBtn.style.display = 'none';
                    downloadBtn.disabled = false;
                } else {
                    statusElement.textContent = 'Not in Library';
                    statusElement.className = 'modal-library-status not-in-library';
                    downloadBtn.style.display = 'inline-block';
                    downloadBtn.disabled = false;
                    
                    // Style download button based on type
                    downloadBtn.className = 'download-btn';
                    if (type === 'radarr') {
                        downloadBtn.classList.add('radarr');
                    }
                    downloadBtn.textContent = type === 'radarr' ? 'Add Movie' : 'Add Series';
                }
            } catch (error) {
                console.error('Error checking library status:', error);
                statusElement.textContent = 'Status Unknown';
                statusElement.className = 'modal-library-status not-in-library';
                downloadBtn.disabled = false;
                downloadBtn.textContent = type === 'radarr' ? 'Add Movie' : 'Add Series';
            }
        }

        async function showCover(item, type) {
            console.log('Showing cover for item:', item.title);
            console.log('Type:', type);

            // Store current item and type for download button
            currentModalItem = item;
            currentModalType = type;

            const modal = document.getElementById('coverModal');
            const modalCover = document.getElementById('modalCover');
            const modalTitle = document.getElementById('modalTitle');
            const modalYear = document.getElementById('modalYear');
            const modalRating = document.getElementById('modalRating');
            const modalSeasonCount = document.getElementById('modalSeasonCount');
            const modalStatus = document.getElementById('modalStatus');
            const modalOverview = document.getElementById('modalOverview');
            const modalDownloadBtn = document.getElementById('modalDownloadBtn');
            const modalLibraryStatus = document.getElementById('modalLibraryStatus');
            const directorySelect = document.getElementById('directorySelect');

            // Set basic content first
            modalTitle.textContent = item.title || item.seriesName || 'Unknown';
            modalYear.textContent = item.year ? `Year: ${item.year}` : '';
            modalOverview.textContent = item.overview || 'No overview available';

            // Display rating if available
            if (item.ratings && item.ratings.value) {
                const rating = item.ratings.value;
                modalRating.textContent = `⭐ Rating: ${rating}/10`;
            } else {
                modalRating.textContent = '';
            }

            // Display season count and status for series
            if (type === 'sonarr') {
                const seasonCount = item.seasons ? item.seasons.length : 0;
                modalSeasonCount.textContent = seasonCount > 0 ? `${seasonCount} Season${seasonCount !== 1 ? 's' : ''}` : '';
                
                const status = item.status || 'Unknown';
                const statusText = status === 'ended' ? 'Concluded' : (status === 'continuing' ? 'Continuing' : status);
                modalStatus.textContent = statusText;
                modalStatus.className = `modal-status ${status === 'ended' ? 'concluded' : 'continuing'}`;
            } else {
                modalSeasonCount.textContent = '';
                modalStatus.textContent = '';
                modalStatus.className = 'modal-status';
            }

            // Display poster image
            let posterUrl = '';
            if (item.images && item.images.length > 0) {
                const poster = item.images.find(img => img.coverType === 'poster');
                if (poster) {
                    // Convert relative URL to absolute URL if needed
                    if (poster.url.startsWith('/')) {
                        const config = type === 'sonarr' ? SONARR_CONFIG : RADARR_CONFIG;
                        posterUrl = config.url + poster.url;
                    } else {
                        posterUrl = poster.url;
                    }
                }
            }

            if (posterUrl) {
                modalCover.src = posterUrl;
                modalCover.style.display = 'block';
                modalCover.onerror = function() {
                    this.style.display = 'none';
                };
            } else {
                modalCover.style.display = 'none';
            }

            // Fetch and populate root folders based on type
            try {
                const config = type === 'sonarr' ? SONARR_CONFIG : RADARR_CONFIG;
                const response = await fetchWithFallback(config, `/api/v3/rootfolder?apiKey=${config.apiKey}`);
                if (response.ok) {
                    const rootFolders = await response.json();
                    const defaultRootFolder = config.defaultRootFolder || '';
                    directorySelect.innerHTML = rootFolders.map(folder => 
                        `<option value="${folder.path}" ${folder.path === defaultRootFolder ? 'selected' : ''}>${folder.path}</option>`
                    ).join('');
                } else {
                    directorySelect.innerHTML = '<option value="">Failed to load directories</option>';
                }
            } catch (error) {
                console.error('Error fetching root folders:', error);
                directorySelect.innerHTML = '<option value="">Failed to load directories</option>';
            }

            // Set modal download button text based on type
            modalDownloadBtn.textContent = type === 'radarr' ? 'Add Movie' : 'Add Series';
            modalDownloadBtn.className = 'download-btn';
            if (type === 'radarr') {
                modalDownloadBtn.classList.add('radarr');
            }

            // Show modal
            modal.style.display = 'block';

            // Attach event listener to download button
            modalDownloadBtn.onclick = modalDownload;

            // Check library status
            checkLibraryStatus(item, type, modalLibraryStatus, modalDownloadBtn);
        }

        function modalDownload() {
            if (!currentModalItem || !currentModalType) return;
            
            const modalDownloadBtn = document.getElementById('modalDownloadBtn');
            const directorySelect = document.getElementById('directorySelect');
            const selectedDirectory = directorySelect.value;
            
            if (!selectedDirectory) {
                alert('Please select a download directory');
                return;
            }
            
            // Set loading state
            const originalText = modalDownloadBtn.textContent;
            const originalClass = modalDownloadBtn.className;
            modalDownloadBtn.disabled = true;
            modalDownloadBtn.innerHTML = '<span class="spinner"></span> Adding...';
            
            if (currentModalType === 'sonarr') {
                addSeriesToSonarr(currentModalItem, selectedDirectory).then(() => {
                    modalDownloadBtn.innerHTML = '✓ Added Series';
                    modalDownloadBtn.className = 'download-btn';
                    modalDownloadBtn.style.background = '#4caf50';
                    setTimeout(() => {
                        closeModal();
                    }, 1500);
                }).catch(error => {
                    console.error('Error adding series:', error);
                    modalDownloadBtn.disabled = false;
                    modalDownloadBtn.textContent = originalText;
                    modalDownloadBtn.className = originalClass;
                    alert('Failed to add series: ' + error.message);
                });
            } else if (currentModalType === 'radarr') {
                addMovieToRadarr(currentModalItem, selectedDirectory).then(() => {
                    modalDownloadBtn.innerHTML = '✓ Added Movie';
                    modalDownloadBtn.className = 'download-btn';
                    modalDownloadBtn.style.background = '#4caf50';
                    setTimeout(() => {
                        closeModal();
                    }, 1500);
                }).catch(error => {
                    console.error('Error adding movie:', error);
                    modalDownloadBtn.disabled = false;
                    modalDownloadBtn.textContent = originalText;
                    modalDownloadBtn.className = originalClass;
                    alert('Failed to add movie: ' + error.message);
                });
            }
        }

        function closeModal() {
            const modal = document.getElementById('coverModal');
            if (modal) {
                modal.classList.remove('active');
            }
        }

        // Close modal when clicking outside content
        const coverModal = document.getElementById('coverModal');
        if (coverModal) {
            coverModal.addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModal();
                }
            });
        }

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // SABnzbd functions
        async function fetchSabnzbdDownloads() {
            try {
                await waitForConfig();

                if ((!SABNZBD_CONFIG.url && !SABNZBD_CONFIG.tailscaleUrl) || !SABNZBD_CONFIG.apiKey) {
                    throw new Error('SABnzbd configuration is incomplete. Please configure URL and API key in settings.');
                }

                const response = await fetchWithFallback(
                    SABNZBD_CONFIG,
                    `/api?mode=queue&output=json&apikey=${SABNZBD_CONFIG.apiKey}`
                );
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('SABnzbd error response:', errorText);
                    throw new Error(`SABnzbd API error: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                return data;
            } catch (error) {
                console.error('SABnzbd fetch error:', error);
                throw error;
            }
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function formatTimeLeft(timeString) {
            // Handle both seconds (number) and "HH:MM:SS" string format
            if (!timeString) return 'Unknown';
            
            if (typeof timeString === 'number') {
                if (timeString <= 0) return 'Unknown';
                if (timeString < 60) return `${Math.round(timeString)}s`;
                if (timeString < 3600) return `${Math.round(timeString / 60)}m`;
                if (timeString < 86400) return `${Math.round(timeString / 3600)}h`;
                return `${Math.round(timeString / 86400)}d`;
            }
            
            // Parse "HH:MM:SS" format
            if (typeof timeString === 'string') {
                const parts = timeString.split(':');
                if (parts.length === 3) {
                    const hours = parseInt(parts[0]) || 0;
                    const minutes = parseInt(parts[1]) || 0;
                    const seconds = parseInt(parts[2]) || 0;
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    
                    if (totalSeconds <= 0) return 'Unknown';
                    if (totalSeconds < 60) return `${seconds}s`;
                    if (totalSeconds < 3600) return `${minutes}m ${seconds}s`;
                    if (totalSeconds < 86400) return `${hours}h ${minutes}m`;
                    return `${hours}h ${minutes}m`;
                }
            }
            
            return 'Unknown';
        }

        function displaySabnzbdDownloads(data) {
            const container = document.getElementById('sabnzbdProgress');
            
            if (!data || !data.queue || !data.queue.slots || data.queue.slots.length === 0) {
                container.innerHTML = '<div class="no-results">No active downloads</div>';
                return;
            }

            const downloads = data.queue.slots;
            
            container.innerHTML = downloads.map(slot => {
                // SABnzbd API returns percentage as a string, convert to number
                const progress = parseFloat(slot.percentage) || 0;
                const sizeTotal = parseFloat(slot.mb) || 0; // SABnzbd uses 'mb' for size in megabytes
                const sizeLeft = parseFloat(slot.mbleft) || 0; // SABnzbd uses 'mbleft' for size left in megabytes
                const sizeDownloaded = sizeTotal - sizeLeft;
                const eta = slot.timeleft; // SABnzbd returns timeleft as "HH:MM:SS" string

                return `
                    <div class="download-item">
                        <div class="download-title">${slot.filename || 'Unknown'}</div>
                        <div class="progress-container">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                        <div class="download-info">
                            <span>${sizeDownloaded.toFixed(2)} MB / ${sizeTotal.toFixed(2)} MB (${progress.toFixed(1)}%)</span>
                            <span class="download-eta">ETA: ${formatTimeLeft(eta)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function updateSabnzbdDownloads() {
            try {
                const data = await fetchSabnzbdDownloads();
                displaySabnzbdDownloads(data);
            } catch (error) {
                console.error('Failed to update SABnzbd downloads:', error);
                document.getElementById('sabnzbdProgress').innerHTML = '<div class="error">Failed to load downloads. Make sure SABnzbd is running and accessible.</div>';
            }
        }

        // History functions
        let historyData = [];
        let allHistoryData = [];
        let currentPage = 1;
        const itemsPerPage = 10;

        async function fetchSabnzbdHistory() {
            try {
                await waitForConfig();

                console.log('SABnzbd Config URL:', SABNZBD_CONFIG.url);
                
                if ((!SABNZBD_CONFIG.url && !SABNZBD_CONFIG.tailscaleUrl) || !SABNZBD_CONFIG.apiKey) {
                    console.error('SABnzbd config is missing URL or API key');
                    throw new Error('SABnzbd configuration is incomplete. Please configure URL and API key in settings.');
                }
                
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                const response = await fetchWithFallback(
                    SABNZBD_CONFIG,
                    `/api?mode=history&output=json&limit=20000&apikey=${SABNZBD_CONFIG.apiKey}`
                );
                
                console.log('SABnzbd history response status:', response.status);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('SABnzbd history error response:', errorText);
                    throw new Error(`SABnzbd history API error: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                console.log('SABnzbd history data:', data);
                
                // Store all history for statistics calculation
                if (data && data.history && data.history.slots) {
                    allHistoryData = data.history.slots;
                    
                    // Debug: log first few items to check completed field format
                    if (data.history.slots.length > 0) {
                        console.log('First history slot completed field:', data.history.slots[0].completed, 'type:', typeof data.history.slots[0].completed);
                        console.log('First slot as date:', new Date(data.history.slots[0].completed * 1000));
                    }
                    
                    // Filter history to only include items from the past 30 days for display, sorted most recent first
                    historyData = data.history.slots.filter(slot => {
                        const completedTime = new Date(slot.completed * 1000);
                        return completedTime >= thirtyDaysAgo;
                    }).sort((a, b) => b.completed - a.completed);
                    console.log('Filtered history count:', historyData.length, 'of', data.history.slots.length, 'total');
                    if (historyData.length > 0) {
                        console.log('Most recent item:', historyData[0].name, new Date(historyData[0].completed * 1000));
                        console.log('Oldest displayed item:', historyData[historyData.length-1].name, new Date(historyData[historyData.length-1].completed * 1000));
                    }
                } else {
                    historyData = [];
                    allHistoryData = [];
                    console.log('No history data found or unexpected structure');
                }
                
                return historyData;
            } catch (error) {
                console.error('SABnzbd history fetch error:', error);
                throw error;
            }
        }

        function parseSizeToBytes(sizeStr) {
            if (!sizeStr) return 0;
            const match = sizeStr.match(/^([\d.]+)\s*(\w+)$/i);
            if (!match) return 0;
            const value = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            
            const units = {
                'B': 1,
                'KB': 1024,
                'MB': 1024 * 1024,
                'GB': 1024 * 1024 * 1024,
                'TB': 1024 * 1024 * 1024 * 1024
            };
            
            return value * (units[unit] || 1);
        }

        function calculateDownloadStats() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            
            let todayBytes = 0;
            let monthBytes = 0;
            
            // Use allHistoryData for statistics to get accurate monthly totals
            allHistoryData.forEach(slot => {
                const completedTime = new Date(slot.completed * 1000);
                const sizeBytes = parseSizeToBytes(slot.size);
                
                if (completedTime >= today) {
                    todayBytes += sizeBytes;
                }
                
                if (completedTime >= thisMonth) {
                    monthBytes += sizeBytes;
                }
            });
            
            return {
                today: formatBytes(todayBytes),
                month: formatBytes(monthBytes)
            };
        }

        function displaySabnzbdHistory() {
            const container = document.getElementById('sabnzbdHistory');
            
            if (!historyData || historyData.length === 0) {
                container.innerHTML = '<div class="no-results">No history in the past 30 days</div>';
                return;
            }

            const stats = calculateDownloadStats();

            const totalPages = Math.ceil(historyData.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageData = historyData.slice(startIndex, endIndex);

            let html = `<div class="download-stats">
                <div class="stat-item">
                    <div class="stat-label">Downloaded Today</div>
                    <div class="stat-value">${stats.today}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Downloaded This Month</div>
                    <div class="stat-value">${stats.month}</div>
                </div>
            </div>`;

            html += pageData.map(slot => {
                const completedTime = new Date(slot.completed * 1000);
                const formattedDate = completedTime.toLocaleString();
                // SABnzbd returns size already formatted (e.g., "4.0 GB")
                const formattedSize = slot.size || 'Unknown';

                return `
                    <div class="download-item">
                        <div class="download-title">${slot.name || 'Unknown'}</div>
                        <div class="download-info">
                            <span>Completed: ${formattedDate}</span>
                            <span>Size: ${formattedSize}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Add pagination controls
            html += '<div class="pagination">';
            
            // Previous button
            html += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
            
            // Smart page number display
            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
            
            if (endPage - startPage < maxVisiblePages - 1) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }
            
            // Always show first page
            if (startPage > 1) {
                html += `<button onclick="changePage(1)" ${currentPage === 1 ? 'class="active"' : ''}>1</button>`;
                if (startPage > 2) {
                    html += '<span class="pagination-ellipsis">...</span>';
                }
            }
            
            // Show range of pages around current page
            for (let i = startPage; i <= endPage; i++) {
                html += `<button onclick="changePage(${i})" ${i === currentPage ? 'class="active"' : ''}>${i}</button>`;
            }
            
            // Always show last page
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    html += '<span class="pagination-ellipsis">...</span>';
                }
                html += `<button onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'class="active"' : ''}>${totalPages}</button>`;
            }
            
            // Next button
            html += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
            
            html += '</div>';

            container.innerHTML = html;
        }

        function changePage(page) {
            const totalPages = Math.ceil(historyData.length / itemsPerPage);
            if (page < 1 || page > totalPages) return;
            
            currentPage = page;
            displaySabnzbdHistory();
        }

        // Track current SABnzbd tab state
        window.currentSabnzbdTab = 'progress';

        function switchSabnzbdTab(tab) {
            console.log('=== index.js switchSabnzbdTab called ===');
            console.log('Tab:', tab);
            console.log('currentSabnzbdTab before:', window.currentSabnzbdTab);
            
            const tabs = document.querySelectorAll('.sabnzbd-tab');
            const progressContainer = document.getElementById('sabnzbdProgress');
            const historyContainer = document.getElementById('sabnzbdHistory');
            
            tabs.forEach(t => t.classList.remove('active'));
            
            if (tab === 'progress') {
                console.log('Switching to PROGRESS tab');
                tabs[0].classList.add('active');
                progressContainer.style.display = 'block';
                historyContainer.style.display = 'none';
                window.currentSabnzbdTab = 'progress';
                console.log('currentSabnzbdTab after:', window.currentSabnzbdTab);
            } else if (tab === 'history') {
                console.log('Switching to HISTORY tab');
                tabs[1].classList.add('active');
                progressContainer.style.display = 'none';
                historyContainer.style.display = 'block';
                window.currentSabnzbdTab = 'history';
                currentPage = 1;
                console.log('currentSabnzbdTab after:', window.currentSabnzbdTab);
                fetchSabnzbdHistory().then(() => displaySabnzbdHistory()).catch(error => {
                    console.error('Failed to load history:', error);
                    historyContainer.innerHTML = '<div class="error">Failed to load history. Make sure SABnzbd is running and accessible.</div>';
                });
            }
        }

        // Auto-refresh every 1 second for live updates (only when on progress tab)
        setInterval(() => {
            if (window.currentSabnzbdTab === 'progress') {
                updateSabnzbdDownloads();
            }
        }, 1000);

        // Fetch recent series from Sonarr
        async function fetchRecentSeries() {
            try {
                await waitForConfig();
                const response = await fetchWithFallback(
                    SONARR_CONFIG,
                    `/api/v3/series?sort=sortTitle&order=asc&apiKey=${SONARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Sonarr API error');
                const series = await response.json();
                return series.slice(0, 6); // Limit to 6 items
            } catch (error) {
                console.error('Error fetching recent series:', error);
                return [];
            }
        }

        // Fetch recent movies from Radarr
        async function fetchRecentMovies() {
            try {
                await waitForConfig();
                const response = await fetchWithFallback(
                    RADARR_CONFIG,
                    `/api/v3/movie?sort=sortTitle&order=asc&apiKey=${RADARR_CONFIG.apiKey}`
                );
                if (!response.ok) throw new Error('Radarr API error');
                const movies = await response.json();
                return movies.slice(0, 6); // Limit to 6 items
            } catch (error) {
                console.error('Error fetching recent movies:', error);
                return [];
            }
        }

        // Display recent series in grid
        async function displayRecentSeries() {
            const container = document.getElementById('sonarrRecentSeries');
            if (!container) return;

            try {
                const series = await fetchRecentSeries();
                if (!series || series.length === 0) {
                    container.innerHTML = '<div class="no-results">No series found</div>';
                    return;
                }

                container.innerHTML = series.map(s => `
                    <div class="result-card">
                        <div class="result-poster">${s.seriesName?.substring(0, 2) || s.title?.substring(0, 2) || 'TV'}</div>
                        <div class="result-title">${s.seriesName || s.title || 'Unknown'}</div>
                        <div class="result-year">${s.year || 'N/A'}</div>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error displaying recent series:', error);
                container.innerHTML = '<div class="error">Failed to load series</div>';
            }
        }

        // Display recent movies in grid
        async function displayRecentMovies() {
            const container = document.getElementById('radarrRecentMovies');
            if (!container) return;

            try {
                const movies = await fetchRecentMovies();
                if (!movies || movies.length === 0) {
                    container.innerHTML = '<div class="no-results">No movies found</div>';
                    return;
                }

                container.innerHTML = movies.map(m => `
                    <div class="result-card">
                        <div class="result-poster">${m.title?.substring(0, 2) || 'MV'}</div>
                        <div class="result-title">${m.title || 'Unknown'}</div>
                        <div class="result-year">${m.year || 'N/A'}</div>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error displaying recent movies:', error);
                container.innerHTML = '<div class="error">Failed to load movies</div>';
            }
        }

        // Display search results in recent series grid
        function displayRecentSeriesSearchResults(results) {
            const container = document.getElementById('sonarrRecentSeries');
            if (!container) return;

            if (!results || results.length === 0) {
                container.innerHTML = '<div class="no-results">No series found</div>';
                return;
            }

            // Limit to 20 results (scrollable)
            const limitedResults = results.slice(0, 20);

            container.innerHTML = limitedResults.map(s => {
                const title = s.seriesName || s.title || 'Unknown';
                const posterText = title.substring(0, 2).toUpperCase();
                
                // Try to get poster image from API response
                let posterUrl = '';
                if (s.images && s.images.length > 0) {
                    const poster = s.images.find(img => img.coverType === 'poster');
                    if (poster) {
                        // Convert relative URL to absolute URL if needed
                        if (poster.url.startsWith('/')) {
                            posterUrl = SONARR_CONFIG.url + poster.url;
                        } else {
                            posterUrl = poster.url;
                        }
                    }
                }

                return `
                <div class="result-card" onclick="showCover(${JSON.stringify(s).replace(/"/g, '&quot;')}, 'sonarr')">
                    <div class="result-poster">
                        ${posterUrl ? `<img src="${posterUrl}" alt="${title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="poster-fallback">${posterText}</div>` : posterText}
                    </div>
                    <div class="result-title">${title}</div>
                    <div class="result-year">${s.year || 'N/A'}</div>
                </div>
            `}).join('');
        }

        // Display search results in recent movies grid
        function displayRecentMoviesSearchResults(results) {
            const container = document.getElementById('radarrRecentMovies');
            if (!container) return;

            if (!results || results.length === 0) {
                container.innerHTML = '<div class="no-results">No movies found</div>';
                return;
            }

            // Limit to 20 results (scrollable)
            const limitedResults = results.slice(0, 20);

            container.innerHTML = limitedResults.map(m => {
                const title = m.title || 'Unknown';
                const posterText = title.substring(0, 2).toUpperCase();
                
                // Try to get poster image from API response
                let posterUrl = '';
                if (m.images && m.images.length > 0) {
                    const poster = m.images.find(img => img.coverType === 'poster');
                    if (poster) {
                        // Convert relative URL to absolute URL if needed
                        if (poster.url.startsWith('/')) {
                            posterUrl = RADARR_CONFIG.url + poster.url;
                        } else {
                            posterUrl = poster.url;
                        }
                    }
                }

                return `
                <div class="result-card" onclick="showCover(${JSON.stringify(m).replace(/"/g, '&quot;')}, 'radarr')">
                    <div class="result-poster">
                        ${posterUrl ? `<img src="${posterUrl}" alt="${title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="poster-fallback">${posterText}</div>` : posterText}
                    </div>
                    <div class="result-title">${title}</div>
                    <div class="result-year">${m.year || 'N/A'}</div>
                </div>
            `}).join('');
        }

        // Fetch and update stats for deck layout
        async function updateDeckStats() {
            await waitForConfig();

            // Fetch total series from Sonarr
            try {
                const sonarrResponse = await fetch(`${SONARR_CONFIG.url}/api/v3/series`, {
                    headers: {
                        'X-Api-Key': SONARR_CONFIG.apiKey
                    }
                });
                if (sonarrResponse.ok) {
                    const series = await sonarrResponse.json();
                    const totalSeriesEl = document.getElementById('totalSeries');
                    if (totalSeriesEl) {
                        totalSeriesEl.textContent = series.length;
                    }
                }
            } catch (error) {
                console.error('Error fetching total series:', error);
                const totalSeriesEl = document.getElementById('totalSeries');
                if (totalSeriesEl) {
                    totalSeriesEl.textContent = '0';
                }
            }

            // Fetch total movies from Radarr
            try {
                const radarrResponse = await fetch(`${RADARR_CONFIG.url}/api/v3/movie`, {
                    headers: {
                        'X-Api-Key': RADARR_CONFIG.apiKey
                    }
                });
                if (radarrResponse.ok) {
                    const movies = await radarrResponse.json();
                    const totalMoviesEl = document.getElementById('totalMovies');
                    if (totalMoviesEl) {
                        totalMoviesEl.textContent = movies.length;
                    }
                }
            } catch (error) {
                console.error('Error fetching total movies:', error);
                const totalMoviesEl = document.getElementById('totalMovies');
                if (totalMoviesEl) {
                    totalMoviesEl.textContent = '0';
                }
            }

            // Fetch active downloads from SABnzbd
            try {
                const sabnzbdResponse = await fetch(`${SABNZBD_CONFIG.url}/api?mode=qstatus&output=json&apikey=${SABNZBD_CONFIG.apiKey}`);
                if (sabnzbdResponse.ok) {
                    const data = await sabnzbdResponse.json();
                    const slots = data && data.queue && data.queue.slots ? data.queue.slots : [];
                    const activeDownloads = slots.filter(slot => slot.status === 'downloading' || slot.status === 'queued').length;
                    const activeDownloadsEl = document.getElementById('activeDownloads');
                    if (activeDownloadsEl) {
                        activeDownloadsEl.textContent = activeDownloads;
                    }
                }
            } catch (error) {
                console.error('Error fetching active downloads:', error);
                const activeDownloadsEl = document.getElementById('activeDownloads');
                if (activeDownloadsEl) {
                    activeDownloadsEl.textContent = '0';
                }
            }

            // Fetch upcoming releases from Sonarr calendar
            try {
                const today = new Date();
                const start = today.toISOString().split('T')[0];
                const end = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                
                const calendarResponse = await fetch(`${SONARR_CONFIG.url}/api/v3/calendar?start=${start}&end=${end}&includeUnmonitored=true`, {
                    headers: {
                        'X-Api-Key': SONARR_CONFIG.apiKey
                    }
                });
                if (calendarResponse.ok) {
                    const calendar = await calendarResponse.json();
                    const upcomingEl = document.getElementById('upcomingCount');
                    if (upcomingEl) {
                        upcomingEl.textContent = calendar.length;
                    }
                }
            } catch (error) {
                console.error('Error fetching upcoming releases:', error);
                const upcomingEl = document.getElementById('upcomingCount');
                if (upcomingEl) {
                    upcomingEl.textContent = '0';
                }
            }
        }
