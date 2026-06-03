const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Open native file picker for images
  openFileDialog: () =>
    ipcRenderer.invoke('open-file-dialog'),

  // Save a cropped panel PNG to ~/Desktop/MangaCutie - {stripName}/
  saveCrop: (data) =>
    ipcRenderer.invoke('save-crop', data),

  // Persist app state to disk (strips, crops, zoom, scroll)
  saveCache: (jsonStr) =>
    ipcRenderer.invoke('save-cache', jsonStr),

  // Load persisted app state on startup
  loadCache: () =>
    ipcRenderer.invoke('load-cache'),

  // Clear persisted app state
  clearCache: () =>
    ipcRenderer.invoke('clear-cache'),

  // Check if a file still exists (for cache validation)
  fileExists: (filePath) =>
    ipcRenderer.invoke('file-exists', filePath)
});
