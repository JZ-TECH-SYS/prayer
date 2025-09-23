const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logs', {
  // comandos
  openCurrent: () => ipcRenderer.invoke('open-log-file'),
  listFiles: () => ipcRenderer.invoke('list-log-files'),
  loadFile: (filePath) => ipcRenderer.invoke('load-log-file', filePath),
  requestInitial: () => ipcRenderer.invoke('request-initial-log'),

  // eventos
  onFile: (cb) => ipcRenderer.on('log-file', (_, f) => cb(f)),
  onLine: (cb) => ipcRenderer.on('log-line', (_, l) => cb(l)),
  onInitial: (cb) => ipcRenderer.on('log-initial', (_, t) => cb(t)),
  onList: (cb) => ipcRenderer.on('log-list', (_, list) => cb(list)),
  onToday: (cb) => ipcRenderer.on('log-today', (_, f) => cb(f)),
});
