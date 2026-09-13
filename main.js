const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
if (process.env.MASTARR_DESKTOP_PROFILE)
  app.setPath('userData', process.env.MASTARR_DESKTOP_PROFILE);
let mainWindow;
let serverOrigin;
const launcherPath = path.join(__dirname, 'desktop', 'index.html');
const launcherUrl = pathToFileURL(launcherPath).href;
const preferencesPath = () => path.join(app.getPath('userData'), 'connection.json');
function validateServer(input) {
  if (typeof input !== 'string' || input.length > 500) throw new Error('Enter a valid server URL.');
  const url = new URL(input);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new Error('Use your Mastarr server origin without credentials or a path.');
  return url.origin;
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 380,
    minHeight: 640,
    icon: path.join(__dirname, 'desktop', 'icon.png'),
    backgroundColor: '#101018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, address) => {
    if (address === launcherUrl) return;
    try {
      if (new URL(address).origin !== serverOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('will-redirect', (event, address) => {
    try {
      if (new URL(address).origin !== serverOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_, code, description, address, isMainFrame) => {
    if (isMainFrame && address !== launcherUrl && code !== -3) mainWindow.loadFile(launcherPath);
  });
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')).serverUrl;
  } catch {}
  try {
    serverOrigin = validateServer(process.env.MASTARR_SERVER_URL || saved);
    mainWindow.loadURL(serverOrigin);
  } catch {
    mainWindow.loadFile(launcherPath);
  }

  // After every page load, blur and refocus the window to fix input focus issues
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow.webContents.getURL() === launcherUrl) {
      mainWindow.blur();
      mainWindow.focus();
    }
  });
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', (event) => event.preventDefault());
  ipcMain.handle('connect-server', async (event, input) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame?.url !== launcherUrl)
      return { error: 'This action is only available from the local connection screen.' };
    try {
      serverOrigin = validateServer(input);
      fs.writeFileSync(preferencesPath(), JSON.stringify({ serverUrl: serverOrigin }), {
        mode: 0o600,
      });
      mainWindow.loadURL(serverOrigin).catch(() => mainWindow.loadFile(launcherPath));
      return { ok: true };
    } catch {
      return {
        error: 'Enter a complete http:// or https:// server address without credentials or a path.',
      };
    }
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
