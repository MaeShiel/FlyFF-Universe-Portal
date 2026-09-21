const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  addExtension: () => ipcRenderer.invoke('extensions:add'),
  removeExtension: (id) => ipcRenderer.invoke('extensions:remove', id),
  closeWindow: () => ipcRenderer.invoke('settingsWindow:close'),
  minimize: () => ipcRenderer.invoke('settingsWindow:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('settingsWindow:maximizeToggle'),
  onWindowState: (cb) => ipcRenderer.on('settingsWindow:state', (_evt, state) => cb(state)),

  getKeybinds: () => ipcRenderer.invoke('keybinds:get'),
  setKeybind: (action, combo) => ipcRenderer.invoke('keybinds:set', action, combo),
  resetKeybinds: () => ipcRenderer.invoke('keybinds:reset'),
});
