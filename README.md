# MastARR

A modern web interface for searching and managing your media library with Radarr (movies), Sonarr (TV shows), and SABnzbd (downloads).

## Features

- **Dual Search**: Search both Radarr (movies) and Sonarr (TV shows) simultaneously
- **SABnzbd Integration**: View download progress and history with statistics
- **Calendar View**: See upcoming episodes and movie releases
- **Modern UI**: Clean, responsive interface with multiple themes
- **Real-time Results**: Results display instantly from all services
- **Settings Management**: Configure URLs and API keys through a settings page
- **About Page**: Version information and contact details

## Docker Deployment (Unraid)

### Using Docker Compose

1. Copy the following files to your Unraid server:
   - `Dockerfile`
   - `docker-compose.yml`
   - `index.html`
   - `settings.html`
   - `about.html`
   - `MA.png`

2. Navigate to the directory containing these files

3. Run the container:
   ```bash
   docker-compose up -d
   ```

4. Access the application at `http://your-server-ip:8080`

### Using Unraid Docker Manager

1. In Unraid, go to **Docker** tab
2. Click **Add Container**
3. Use the following settings:
   - **Name**: `mastarr`
   - **Repository**: `nginx:alpine`
   - **Network Type**: `Bridge`
   - **Port**: `8080:80`
   - **Volume Mapping**: Map your local directory with the HTML files to `/usr/share/nginx/html`

4. Start the container

## Configuration

The application stores configuration in your browser's localStorage. To configure your services:

1. Open the application in your browser
2. Click the three-dot menu (•••) in the top right
3. Select **Settings**
4. Enter your Sonarr, Radarr, and SABnzbd URLs and API keys
5. Click **Save**

### Required Services

**Sonarr:**
- URL: Your Sonarr instance URL (e.g., `http://127.0.0.1:8989`)
- API Key: Your Sonarr API key (found in Sonarr Settings > General > API Key)

**Radarr:**
- URL: Your Radarr instance URL (e.g., `http://127.0.0.1:7878`)
- API Key: Your Radarr API key (found in Radarr Settings > General > API Key)

**SABnzbd:**
- URL: Your SABnzbd instance URL (e.g., `http://127.0.0.1:8080`)
- API Key: Your SABnzbd API key (found in SABnzbd Config > General > API Key)

## Usage

1. Open `index.html` in your web browser
2. Type a search term in the search box (e.g., "Breaking Bad", "Inception")
3. Press Enter or click the Search button
4. Results will appear in both the Sonarr (TV shows) and Radarr (movies) sections

## Important Notes

- This application makes direct API calls to your Radarr and Sonarr instances from your browser
- Your browser must be able to access `http://127.0.0.1:8989` and `http://127.0.0.1:8310`
- If you encounter CORS errors, you may need to configure your Radarr/Sonarr instances to allow cross-origin requests, or run this page from the same network
- The API keys are stored in plain text in the HTML file - keep this file secure and don't share it publicly

## Troubleshooting

**"Failed to search Sonarr/Radarr" error:**
- Ensure both services are running and accessible from your network
- Check that the URLs and API keys are correct
- Verify your browser can access the local network addresses

**No results appearing:**
- Try a different search term
- Check that the services have content indexed
- Verify the API endpoints are correct for your Radarr/Sonarr versions

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## License

Free to use and modify for personal use.
