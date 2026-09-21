const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hubAPI', {
  onTabsUpdate: (cb) => ipcRenderer.on('hub:tabsUpdate', (_evt, data) => cb(data)),
  onWindowState: (cb) => ipcRenderer.on('hub:windowState', (_evt, state) => cb(state)),

  activateTab: (accountId) => ipcRenderer.invoke('hub:activateTab', accountId),
  closeTab: (accountId) => ipcRenderer.invoke('hub:closeTab', accountId),
  reorderTab: (accountId, targetIndex) => ipcRenderer.invoke('hub:reorderTab', { accountId, targetIndex }),
  tearOutTab: (accountId, screenX, screenY) => ipcRenderer.invoke('hub:tearOutTab', { accountId, screenX, screenY }),

  minimize: () => ipcRenderer.invoke('hub:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('hub:maximizeToggle'),
  close: () => ipcRenderer.invoke('hub:close'),
});
