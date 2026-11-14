const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flyffAPI', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  saveAccount: (account) => ipcRenderer.invoke('accounts:save', account),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),
  openAccount: (id) => ipcRenderer.invoke('accounts:open', id),

  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (profile) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  openProfile: (id) => ipcRenderer.invoke('profiles:open', id),

  fetchNews: () => ipcRenderer.invoke('news:fetch'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:maximizeToggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowState: (cb) => ipcRenderer.on('window:state', (_evt, state) => cb(state)),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  openUtility: (type) => ipcRenderer.invoke('window:openUtility', type),
  openCommunityMenu: (pos) => ipcRenderer.invoke('window:openCommunityMenu', pos),
});
