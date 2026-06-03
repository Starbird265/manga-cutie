const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow = null;

// ─── Window Creation ──────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'MangaCutie',
    backgroundColor: '#030712',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false   // allow file:// image loading
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Native File Dialog ──────────────────────────────────────────────────

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Manga Strips',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled) return { success: false, paths: [] };
  return { success: true, paths: result.filePaths };
});

// ─── IPC: Save Crop to Desktop ────────────────────────────────────────────────

ipcMain.handle('save-crop', async (_event, data) => {
  const { buffer, stripName, fileName } = data;

  try {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    // Sanitize folder name: remove characters invalid in filenames
    const safeName = stripName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 60);
    const targetFolder = path.join(desktopPath, `MangaCutie - ${safeName}`);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const filePath = path.join(targetFolder, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    return { success: true, path: filePath };
  } catch (error) {
    console.error('Failed to save crop:', error);
    return { success: false, error: error.message };
  }
});

// ─── IPC: Cache Management ────────────────────────────────────────────────────

const CACHE_FILE = path.join(app.getPath('userData'), 'mangacutie-cache.json');

ipcMain.handle('save-cache', async (_event, jsonStr) => {
  try {
    fs.writeFileSync(CACHE_FILE, jsonStr, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save cache:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-cache', async () => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return { success: true, data };
    }
    return { success: true, data: null };
  } catch (error) {
    console.error('Failed to load cache:', error);
    return { success: false, error: error.message };
  }
});

// ─── IPC: Check if file exists (for cache validation) ─────────────────────────

ipcMain.handle('file-exists', async (_event, filePath) => {
  return fs.existsSync(filePath);
});
