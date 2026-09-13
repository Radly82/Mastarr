const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mastarrDesktop', {
  connect: (address) => ipcRenderer.invoke('connect-server', address),
});
