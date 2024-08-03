const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    onProcessingComplete: (callback) => ipcRenderer.on('processing-complete', callback),
    onProcessingError: (callback) => ipcRenderer.on('processing-error', callback),
    onProgressInit: (callback) => ipcRenderer.on('progress-init', callback),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', callback),
    onRateUpdate: (callback) => ipcRenderer.on('rate-update', callback),
});