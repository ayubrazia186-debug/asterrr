const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aster', {
  state: () => ipcRenderer.invoke('tablet:state'),
  toggle: () => ipcRenderer.invoke('tablet:toggle'),
  copy: (t) => ipcRenderer.send('tablet:copy', String(t)),
});

// the Aster web app (not the tablet window) uses this for Focus Lock
contextBridge.exposeInMainWorld('asterDesktop', {
  lock: {
    load: () => ipcRenderer.invoke('lock:load'),
    save: (s) => ipcRenderer.invoke('lock:save', s),
    unlock: (reason) => ipcRenderer.invoke('lock:unlock', reason),
    dialog: () => ipcRenderer.send('lock:dialog'),
  },
});
