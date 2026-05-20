const { ipcRenderer } = require('electron');

window.api = {
  createSession: (opts) => ipcRenderer.invoke('session:create', opts),
  writeSession: (id, data) => ipcRenderer.invoke('session:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('session:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('session:kill', { id }),
  listSessions: () => ipcRenderer.invoke('session:list'),
  openDir: () => ipcRenderer.invoke('dialog:openDir'),
  platform: process.platform,

  onData: (callback) => {
    const wrapper = (_, data) => callback(data);
    ipcRenderer.on('session:data', wrapper);
    return wrapper;
  },
  onExit: (callback) => {
    const wrapper = (_, data) => callback(data);
    ipcRenderer.on('session:exit', wrapper);
    return wrapper;
  },
  removeDataListener: (wrapper) => ipcRenderer.removeListener('session:data', wrapper),
  removeExitListener: (wrapper) => ipcRenderer.removeListener('session:exit', wrapper),
};
