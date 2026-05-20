const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  createSession: (opts) => ipcRenderer.invoke('session:create', opts),
  writeSession: (id, data) => ipcRenderer.invoke('session:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('session:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('session:kill', { id }),
  listSessions: () => ipcRenderer.invoke('session:list'),
  openDir: () => ipcRenderer.invoke('dialog:openDir'),
  platform: process.platform,

  onData: (callback) => ipcRenderer.on('session:data', (_, data) => callback(data)),
  onExit: (callback) => ipcRenderer.on('session:exit', (_, data) => callback(data)),
});

// Expose xterm modules to renderer (only available in preload context)
contextBridge.exposeInMainWorld('xterm', {
  Terminal: require('@xterm/xterm').Terminal,
  FitAddon: require('@xterm/addon-fit').FitAddon,
  WebLinksAddon: require('@xterm/addon-web-links').WebLinksAddon,
});
