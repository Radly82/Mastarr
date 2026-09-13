async function loadSettings() {
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
            
            document.getElementById('sonarrUrl').value = settings.sonarrUrl || '';
            document.getElementById('sonarrTailscaleUrl').value = settings.sonarrTailscaleUrl || '';
            document.getElementById('sonarrApiKey').value = settings.sonarrApiKey || '';
            document.getElementById('radarrUrl').value = settings.radarrUrl || '';
            document.getElementById('radarrTailscaleUrl').value = settings.radarrTailscaleUrl || '';
            document.getElementById('radarrApiKey').value = settings.radarrApiKey || '';
            document.getElementById('sabnzbdUrl').value = settings.sabnzbdUrl || '';
            document.getElementById('sabnzbdTailscaleUrl').value = settings.sabnzbdTailscaleUrl || '';
            document.getElementById('sabnzbdApiKey').value = settings.sabnzbdApiKey || '';
            setDefaultRootFolderOption('sonarrDefaultRootFolder', settings.sonarrDefaultRootFolder || '');
            setDefaultRootFolderOption('radarrDefaultRootFolder', settings.radarrDefaultRootFolder || '');
        }

        async function saveSettingsToBackend(settings) {
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
                    return true;
                }
                throw new Error('Backend API not available');
            } catch (error) {
                console.log('Backend API not available, using localStorage');
                // Fallback to localStorage
                localStorage.setItem('appSettings', JSON.stringify(settings));
                return false;
            }
        }

        async function getExistingSettings() {
            try {
                const response = await fetch('/api/settings');
                if (response.ok) {
                    return await response.json();
                }
            } catch (e) {}
            try {
                return JSON.parse(localStorage.getItem('appSettings') || '{}');
            } catch (e) {
                return {};
            }
        }

        async function saveSonarrSettings() {
            const rootFolder = document.getElementById('sonarrDefaultRootFolder').value;
            if (!rootFolder) {
                document.getElementById('sonarrSaveWarning').classList.add('show');
                return;
            }
            document.getElementById('sonarrSaveWarning').classList.remove('show');
            
            let settings = await getExistingSettings();
            
            settings.sonarrUrl = document.getElementById('sonarrUrl').value;
            settings.sonarrTailscaleUrl = document.getElementById('sonarrTailscaleUrl').value;
            settings.sonarrApiKey = document.getElementById('sonarrApiKey').value;
            settings.sonarrDefaultRootFolder = rootFolder;
            
            await saveSettingsToBackend(settings);
            alert('Sonarr settings saved successfully!');
        }

        async function saveRadarrSettings() {
            const rootFolder = document.getElementById('radarrDefaultRootFolder').value;
            if (!rootFolder) {
                document.getElementById('radarrSaveWarning').classList.add('show');
                return;
            }
            document.getElementById('radarrSaveWarning').classList.remove('show');
            
            let settings = await getExistingSettings();
            
            settings.radarrUrl = document.getElementById('radarrUrl').value;
            settings.radarrTailscaleUrl = document.getElementById('radarrTailscaleUrl').value;
            settings.radarrApiKey = document.getElementById('radarrApiKey').value;
            settings.radarrDefaultRootFolder = rootFolder;
            
            await saveSettingsToBackend(settings);
            alert('Radarr settings saved successfully!');
        }

        async function saveSabnzbdSettings() {
            let settings = await getExistingSettings();
            
            settings.sabnzbdUrl = document.getElementById('sabnzbdUrl').value;
            settings.sabnzbdTailscaleUrl = document.getElementById('sabnzbdTailscaleUrl').value;
            settings.sabnzbdApiKey = document.getElementById('sabnzbdApiKey').value;
            
            await saveSettingsToBackend(settings);
            alert('Sabnzbd settings saved successfully!');
        }

        function setDefaultRootFolderOption(selectId, value) {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select a directory (required)</option>';

            if (value) {
                select.innerHTML += `<option value="${value}" selected>${value}</option>`;
            }
        }

        function importSettings(input) {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const settings = JSON.parse(e.target.result);
                    
                    // Fill Sonarr fields
                    document.getElementById('sonarrUrl').value = settings.sonarrUrl || '';
                    document.getElementById('sonarrTailscaleUrl').value = settings.sonarrTailscaleUrl || '';
                    document.getElementById('sonarrApiKey').value = settings.sonarrApiKey || '';
                    setDefaultRootFolderOption('sonarrDefaultRootFolder', settings.sonarrDefaultRootFolder || '');
                    
                    // Fill Radarr fields
                    document.getElementById('radarrUrl').value = settings.radarrUrl || '';
                    document.getElementById('radarrTailscaleUrl').value = settings.radarrTailscaleUrl || '';
                    document.getElementById('radarrApiKey').value = settings.radarrApiKey || '';
                    setDefaultRootFolderOption('radarrDefaultRootFolder', settings.radarrDefaultRootFolder || '');
                    
                    // Fill Sabnzbd fields
                    document.getElementById('sabnzbdUrl').value = settings.sabnzbdUrl || '';
                    document.getElementById('sabnzbdTailscaleUrl').value = settings.sabnzbdTailscaleUrl || '';
                    document.getElementById('sabnzbdApiKey').value = settings.sabnzbdApiKey || '';
                    
                    alert('Settings imported successfully! Please review and click "Save All Settings" to save.');
                } catch (error) {
                    alert('Error importing settings: Invalid JSON file format.');
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
            
            // Reset file input
            input.value = '';
        }

        async function saveAllSettings() {
            const sonarrRootFolder = document.getElementById('sonarrDefaultRootFolder').value;
            const radarrRootFolder = document.getElementById('radarrDefaultRootFolder').value;
            
            // Validate required directories
            if (!sonarrRootFolder) {
                document.getElementById('sonarrSaveWarning').classList.add('show');
                alert('Please select a default series directory for Sonarr before saving.');
                return;
            }
            if (!radarrRootFolder) {
                document.getElementById('radarrSaveWarning').classList.add('show');
                alert('Please select a default movie directory for Radarr before saving.');
                return;
            }
            
            document.getElementById('sonarrSaveWarning').classList.remove('show');
            document.getElementById('radarrSaveWarning').classList.remove('show');
            
            const settings = {
                sonarrUrl: document.getElementById('sonarrUrl').value,
                sonarrTailscaleUrl: document.getElementById('sonarrTailscaleUrl').value,
                sonarrApiKey: document.getElementById('sonarrApiKey').value,
                sonarrDefaultRootFolder: sonarrRootFolder,
                radarrUrl: document.getElementById('radarrUrl').value,
                radarrTailscaleUrl: document.getElementById('radarrTailscaleUrl').value,
                radarrApiKey: document.getElementById('radarrApiKey').value,
                radarrDefaultRootFolder: radarrRootFolder,
                sabnzbdUrl: document.getElementById('sabnzbdUrl').value,
                sabnzbdTailscaleUrl: document.getElementById('sabnzbdTailscaleUrl').value,
                sabnzbdApiKey: document.getElementById('sabnzbdApiKey').value
            };
            
            await saveSettingsToBackend(settings);
            alert('All settings saved successfully!');
        }

        function getServiceUrls(type) {
            return [
                document.getElementById(`${type}Url`).value,
                document.getElementById(`${type}TailscaleUrl`).value
            ].filter(Boolean);
        }

        async function fetchWithFallback(type, path) {
            const urls = getServiceUrls(type);
            if (urls.length === 0) throw new Error('No service URL configured');

            const TIMEOUT_MS = 5000;

            function fetchWithTimeout(baseUrl) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
                return fetch(`${baseUrl}${path}`, { signal: controller.signal })
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
                return fetchWithTimeout(urls[0]);
            }

            // Race all URLs simultaneously, return first success
            return new Promise((resolve, reject) => {
                let errors = 0;
                const total = urls.length;
                urls.forEach(baseUrl => {
                    fetchWithTimeout(baseUrl)
                        .then(resolve)
                        .catch(() => {
                            errors++;
                            if (errors === total) reject(new Error('All service URLs failed or timed out'));
                        });
                });
            });
        }

        async function loadRootFolders(type) {
            const apiKeyInput = document.getElementById(`${type}ApiKey`);
            const select = document.getElementById(`${type}DefaultRootFolder`);
            const currentValue = select.value;
            const serviceName = type === 'sonarr' ? 'Sonarr' : 'Radarr';

            if (getServiceUrls(type).length === 0 || !apiKeyInput.value) {
                alert(`Please enter your ${serviceName} URL and API key first.`);
                return;
            }

            select.innerHTML = '<option value="">Loading directories...</option>';

            try {
                const response = await fetchWithFallback(type, `/api/v3/rootfolder?apiKey=${apiKeyInput.value}`);

                if (!response.ok) {
                    throw new Error(`Failed to load ${serviceName} directories.`);
                }

                const rootFolders = await response.json();
                select.innerHTML = '<option value="">Select a directory (required)</option>';
                rootFolders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder.path;
                    option.textContent = folder.path;
                    option.selected = folder.path === currentValue;
                    select.appendChild(option);
                });
            } catch (error) {
                select.innerHTML = '<option value="">Failed to load directories</option>';
                alert(error.message);
            }
        }

        async function testConnection(type) {
            const primaryUrl = document.getElementById(`${type}Url`).value;
            const tailscaleUrl = document.getElementById(`${type}TailscaleUrl`).value;
            const apiKeyInput = document.getElementById(`${type}ApiKey`);
            const status = document.getElementById(`${type}ConnectionStatus`);
            const serviceName = type === 'sonarr' ? 'Sonarr' : type === 'radarr' ? 'Radarr' : 'Sabnzbd';

            status.className = 'status-message';
            status.textContent = '';

            if (getServiceUrls(type).length === 0 || !apiKeyInput.value) {
                status.textContent = `Please enter your ${serviceName} URL and API key first.`;
                status.classList.add('error');
                return;
            }

            status.textContent = `Testing ${serviceName} connection...`;
            status.classList.add('success');

            const testPath = type === 'sabnzbd'
                ? `/api?mode=version&output=json&apikey=${apiKeyInput.value}`
                : `/api/v3/system/status?apiKey=${apiKeyInput.value}`;

            const tests = await Promise.all([
                testSingleConnection(primaryUrl, testPath),
                testSingleConnection(tailscaleUrl, testPath)
            ]);

            const primaryPassed = tests[0].passed;
            const tailscalePassed = tests[1].passed;
            const version = tests.find(test => test.version)?.version || '';

            if (primaryUrl && tailscaleUrl && primaryPassed && tailscalePassed) {
                status.textContent = `${serviceName} connection successful on both primary URL and Tailscale URL${version ? ` - version ${version}` : ''}.`;
                status.className = 'status-message success';
            } else if (primaryUrl && primaryPassed && (!tailscaleUrl || !tailscalePassed)) {
                status.textContent = `${serviceName} connection successful on primary URL${version ? ` - version ${version}` : ''}.${tailscaleUrl ? ' Tailscale URL failed.' : ''}`;
                status.className = tailscaleUrl ? 'status-message error' : 'status-message success';
            } else if (tailscaleUrl && tailscalePassed && (!primaryUrl || !primaryPassed)) {
                status.textContent = `${serviceName} connection successful on Tailscale URL${version ? ` - version ${version}` : ''}.${primaryUrl ? ' Primary URL failed.' : ''}`;
                status.className = primaryUrl ? 'status-message error' : 'status-message success';
            } else {
                status.textContent = `${serviceName} connection failed on both primary URL and Tailscale URL. Check the URLs, API key, Tailscale connection, and service port.`;
                status.className = 'status-message error';
            }
        }

        async function testSingleConnection(baseUrl, path) {
            if (!baseUrl) {
                return { passed: false, version: '' };
            }

            try {
                const response = await fetch(`${baseUrl}${path}`);

                if (!response.ok) {
                    return { passed: false, version: '' };
                }

                const data = await response.json();
                return {
                    passed: true,
                    version: data.version || data.status?.version || ''
                };
            } catch (error) {
                return { passed: false, version: '' };
            }
        }

        // Load saved theme on page load
        function loadTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            const html = document.documentElement;
            
            // Remove all theme attributes
            html.removeAttribute('data-theme');
            
            // Set the selected theme
            if (savedTheme !== 'dark') {
                html.setAttribute('data-theme', savedTheme);
            }
            
        }

        // Load settings on page load
        document.addEventListener('DOMContentLoaded', () => {
            loadTheme();
            loadSettings();
        });
