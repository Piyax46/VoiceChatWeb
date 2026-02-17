const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onGetScreenSources: (callback) => ipcRenderer.on('get-screen-sources', (_event, sources) => callback(sources)),
    selectScreenSource: (sourceId) => ipcRenderer.send('select-screen-source', sourceId)
});
