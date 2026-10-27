const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aster', {
  state: () => ipcRenderer.invoke('tablet:state'),
  toggle: () => ipcRenderer.invoke('tablet:toggle'),
  copy: (t) => ipcRenderer.send('tablet:copy', String(t)),
});
