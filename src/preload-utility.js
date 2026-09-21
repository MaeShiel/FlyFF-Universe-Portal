const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utilityAPI', {
  getData: (type) => ipcRenderer.invoke('widgets:get', type),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  setData: (type, data) => ipcRenderer.invoke('widgets:set', type, data),
  toggleMinimize: () => ipcRenderer.invoke('utilityWindow:toggleMinimize'),
  closeWindow: () => ipcRenderer.invoke('utilityWindow:close'),
});
