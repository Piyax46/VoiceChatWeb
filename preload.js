const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Screen sharing
    onGetScreenSources: (callback) => ipcRenderer.on('get-screen-sources', (_event, sources) => callback(sources)),
    selectScreenSource: (sourceId) => ipcRenderer.send('select-screen-source', sourceId),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close')
});
