const { app, BrowserWindow, BrowserView, ipcMain, dialog, session, Menu, shell } = require('electron');
const path = require('path');
const store = require('./accountStore');
const widgetsStore = require('./widgetsStore');
const keybindsStore = require('./keybindsStore');

// Electron/Chromium can render web content noticeably darker/washed-out than a regular installed
// browser on Windows displays with wide-gamut/HDR color profiles. Force sRGB so the game view
// matches how it looks in a normal browser.
app.commandLine.appendSwitch('force-color-profile', 'srgb');

const FLYFF_URL = 'https://universe.flyff.com/play';
const APP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');
const TAB_BAR_HEIGHT = 42;
const WIDGET_TITLEBAR_HEIGHT = 40;

const COMMUNITY_LINKS = [
  { label: 'Flyffipedia', url: 'https://flyffipedia.com' },
  { label: 'Flyffulator', url: 'https://flyffulator.com/' },
  { label: 'Flyff Calculators', url: 'https://flyff-calculators.com/' },
  { label: 'Siege Stats', url: 'https://siegestats.cc/' },
  { label: 'CS-Modelviewer', url: 'https://flyffuniversemodelviewer.com/cs-viewer' },
  { label: "Navi's Bestiary", url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8eNyPRo38JZA7ACZbCNJ1MYsW1nqhVnV8pHWv-GBEx7W8jf2-UGwWr6QCEwUBr5QmCj12_wKxtE9v/pubhtml' },
];

let homeWindow = null;
let settingsWindow = null;
const utilityWindows = new Map(); // type -> BrowserWindow
// Game Hub windows host one or more account tabs (BrowserView per tab), like a browser's tab strip.
const hubWindows = new Map(); // hubWindow.webContents.id -> { window, tabs: [{ accountId, name, view }], activeAccountId }
const accountHub = new Map(); // accountId -> hubWindow.webContents.id

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (homeWindow) {
      if (homeWindow.isMinimized()) homeWindow.restore();
      homeWindow.focus();
    }
  });
}

function createHomeWindow() {
  if (homeWindow) {
    homeWindow.focus();
    return;
  }
  homeWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: 'Flyff U Portal',
    frame: false,
    backgroundColor: '#14161c',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload-home.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  homeWindow.loadFile(path.join(__dirname, '..', 'home', 'index.html'));
  homeWindow.maximize();
  homeWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  homeWindow.on('closed', () => {
    homeWindow = null;
  });
  homeWindow.on('maximize', () => homeWindow.webContents.send('window:state', { maximized: true }));
  homeWindow.on('unmaximize', () => homeWindow.webContents.send('window:state', { maximized: false }));
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 700,
    height: 560,
    minWidth: 480,
    minHeight: 400,
    title: 'Settings - Flyff U Portal',
    frame: false,
    backgroundColor: '#14161c',
    icon: APP_ICON,
    parent: homeWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, '..', 'settings', 'index.html'));
  settingsWindow.on('maximize', () => settingsWindow.webContents.send('settingsWindow:state', { maximized: true }));
  settingsWindow.on('unmaximize', () => settingsWindow.webContents.send('settingsWindow:state', { maximized: false }));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

const UTILITY_WINDOW_CONFIG = {
  fcoin: { title: 'FCoin Calculator', width: 320, height: 320 },
  questlog: { title: 'Quest Log', width: 340, height: 440, dockToHome: true },
  notepad: { title: 'Notepad', width: 380, height: 460 },
  todo: { title: 'To-Do', width: 340, height: 440 },
};

function positionUtilityWindow(type, win) {
  const config = UTILITY_WINDOW_CONFIG[type];
  if (!config?.dockToHome || !homeWindow || homeWindow.isDestroyed() || win.isDestroyed()) return;

  const { x: homeX, y: homeY, width: homeWidth, height: homeHeight } = homeWindow.getBounds();
  const titlebarHeight = 40;
  win.setBounds({
    x: Math.max(homeX, homeX + homeWidth - config.width),
    y: homeY + titlebarHeight,
    width: config.width,
    height: Math.max(260, homeHeight - titlebarHeight),
  });
}

function createUtilityWindow(type) {
  const existing = utilityWindows.get(type);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const config = UTILITY_WINDOW_CONFIG[type];
  if (!config) return;

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    minWidth: 280,
    minHeight: 260,
    title: config.title,
    frame: false,
    maximizable: false,
    backgroundColor: '#14161c',
    icon: APP_ICON,
    parent: homeWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-utility.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  if (config.dockToHome) {
    positionUtilityWindow(type, win);
    const reposition = () => positionUtilityWindow(type, win);
    homeWindow?.on('move', reposition);
    homeWindow?.on('resize', reposition);
    homeWindow?.on('maximize', reposition);
    homeWindow?.on('unmaximize', reposition);
    win.on('closed', () => {
      homeWindow?.removeListener('move', reposition);
      homeWindow?.removeListener('resize', reposition);
      homeWindow?.removeListener('maximize', reposition);
      homeWindow?.removeListener('unmaximize', reposition);
    });
  }
  win.loadFile(path.join(__dirname, '..', 'utility', 'index.html'), { query: { type, title: config.title } });
  win.on('closed', () => utilityWindows.delete(type));
  utilityWindows.set(type, win);
}

function showCommunityResourcesMenu(x, y) {
  const menu = Menu.buildFromTemplate(
    COMMUNITY_LINKS.map((link) => ({
      label: link.label,
      click: () => shell.openExternal(link.url),
    }))
  );
  menu.popup({ window: homeWindow, x, y });
}

async function loadExtensionsIntoSession(ses) {
  const extensions = store.listExtensions();
  for (const ext of extensions) {
    try {
      await ses.loadExtension(ext.path, { allowFileAccess: true });
    } catch (err) {
      console.error(`Failed to load extension "${ext.name}" (${ext.path}):`, err.message);
    }
  }
}

function layoutActiveView(state) {
  if (state.window.isDestroyed() || !state.activeAccountId) return;
  const tab = state.tabs.find((t) => t.accountId === state.activeAccountId);
  if (!tab) return;
  const [width, height] = state.window.getContentSize();
  tab.view.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width, height: Math.max(0, height - TAB_BAR_HEIGHT) });
}

function sendTabsUpdate(state) {
  if (state.window.isDestroyed()) return;
  state.window.webContents.send('hub:tabsUpdate', {
    tabs: state.tabs.map((t) => ({ accountId: t.accountId, name: t.name })),
    activeAccountId: state.activeAccountId,
  });
}

// Converts an Electron before-input-event `input` into a normalized, order-independent
// combo string (e.g. "ctrl+tab") so it can be compared against a stored keybind.
function inputToCombo(input) {
  const parts = [];
  if (input.control || input.meta) parts.push('ctrl');
  if (input.alt) parts.push('alt');
  if (input.shift) parts.push('shift');
  const key = String(input.key || '').toLowerCase();
  if (!['control', 'alt', 'shift', 'meta'].includes(key) && key) parts.push(key);
  return parts.sort().join('+');
}

function normalizeCombo(combo) {
  return String(combo || '')
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join('+');
}

function swapToPreviousTab(state) {
  if (!state.previousAccountId) return;
  const target = state.tabs.find((t) => t.accountId === state.previousAccountId);
  if (target) setActiveTab(state, target.accountId);
}

function toggleHubFullscreen(state) {
  if (state.window.isDestroyed()) return;
  state.window.setFullScreen(!state.window.isFullScreen());
}

function closeActiveTabShortcut(state) {
  if (state.activeAccountId) closeTab(state, state.activeAccountId);
}

// Handles browser-tab-style shortcuts (swap tab, fullscreen, close tab) while a game hub
// window is focused. Scoped per-window via before-input-event instead of globalShortcut so
// the keys only act on the active tab strip, like a normal browser tab.
function handleHubShortcut(state, event, input) {
  if (input.type !== 'keyDown') return;
  const combo = inputToCombo(input);
  if (!combo) return;
  const keybinds = keybindsStore.getAll();

  if (keybinds.swapTab && combo === normalizeCombo(keybinds.swapTab)) {
    event.preventDefault();
    swapToPreviousTab(state);
  } else if (keybinds.toggleFullscreen && combo === normalizeCombo(keybinds.toggleFullscreen)) {
    event.preventDefault();
    toggleHubFullscreen(state);
  } else if (keybinds.closeTab && combo === normalizeCombo(keybinds.closeTab)) {
    event.preventDefault();
    closeActiveTabShortcut(state);
  }
}

function setActiveTab(state, accountId) {
  const tab = state.tabs.find((t) => t.accountId === accountId);
  if (!tab || state.window.isDestroyed()) return;
  if (state.activeAccountId && state.activeAccountId !== accountId) {
    state.previousAccountId = state.activeAccountId;
  }
  for (const t of state.tabs) {
    try { state.window.removeBrowserView(t.view); } catch { /* view may not be attached */ }
  }
  state.window.addBrowserView(tab.view);
  // Electron's native autoResize fights with our manual layoutActiveView bounds calc (it anchors
  // to top-left and ignores the tab-bar y offset), which left the game's internal camera/canvas
  // sized against a stale bounds and made the character view drift off-center after a resize.
  tab.view.setAutoResize({ width: false, height: false });
  state.activeAccountId = accountId;
  layoutActiveView(state);
  sendTabsUpdate(state);
}

// After a live resize settles, nudge the BrowserView's bounds by a pixel and back to force the
// game's canvas to fully reflow. Without this, the Chromium compositor can leave the character's
// camera view rendered against the pre-resize viewport, appearing off-center from the window.
function nudgeActiveViewRepaint(state) {
  if (state.window.isDestroyed() || !state.activeAccountId) return;
  const tab = state.tabs.find((t) => t.accountId === state.activeAccountId);
  if (!tab) return;
  const bounds = tab.view.getBounds();
  tab.view.setBounds({ ...bounds, height: Math.max(0, bounds.height - 1) });
  setImmediate(() => {
    if (!state.window.isDestroyed()) tab.view.setBounds(bounds);
  });
}

function closeTab(state, accountId) {
  const idx = state.tabs.findIndex((t) => t.accountId === accountId);
  if (idx === -1) return;
  const [tab] = state.tabs.splice(idx, 1);
  if (!state.window.isDestroyed()) {
    try { state.window.removeBrowserView(tab.view); } catch { /* already detached */ }
  }
  accountHub.delete(accountId);

  if (state.tabs.length === 0) {
    if (!state.window.isDestroyed()) state.window.close();
    return;
  }
  if (state.activeAccountId === accountId) {
    const next = state.tabs[Math.max(0, idx - 1)] || state.tabs[0];
    setActiveTab(state, next.accountId);
  } else {
    sendTabsUpdate(state);
  }
}

function reorderTab(state, accountId, targetIndex) {
  const currentIndex = state.tabs.findIndex((t) => t.accountId === accountId);
  if (currentIndex === -1) return;
  const [tab] = state.tabs.splice(currentIndex, 1);
  const nextIndex = Math.max(0, Math.min(targetIndex, state.tabs.length));
  state.tabs.splice(nextIndex, 0, tab);
  sendTabsUpdate(state);
}

function tearOutTab(state, accountId, screenX, screenY) {
  const idx = state.tabs.findIndex((t) => t.accountId === accountId);
  if (idx === -1) return;

  if (state.tabs.length === 1) {
    // Already alone in its own window - just move that window under the cursor.
    state.window.setPosition(Math.round(screenX - 60), Math.round(screenY - 10));
    state.window.focus();
    return;
  }

  const [tab] = state.tabs.splice(idx, 1);
  if (!state.window.isDestroyed()) {
    try { state.window.removeBrowserView(tab.view); } catch { /* already detached */ }
  }
  accountHub.delete(accountId);
  if (state.activeAccountId === accountId) {
    const next = state.tabs[Math.max(0, idx - 1)] || state.tabs[0];
    if (next) setActiveTab(state, next.accountId);
  } else {
    sendTabsUpdate(state);
  }

  const newState = createGameHubWindow({ x: Math.round(screenX - 60), y: Math.round(screenY - 10) });
  newState.tabs.push(tab);
  accountHub.set(accountId, newState.window.webContents.id);
  newState.window.once('ready-to-show', () => setActiveTab(newState, accountId));
}

function getPreferredHubState() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && hubWindows.has(focused.webContents.id)) return hubWindows.get(focused.webContents.id);
  const first = hubWindows.values().next();
  return first.done ? null : first.value;
}

function createGameHubWindow(position) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    x: position ? position.x : undefined,
    y: position ? position.y : undefined,
    title: 'Flyff U Portal',
    frame: false,
    backgroundColor: '#0b0c0f',
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-gamehub.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'gamehub', 'index.html'));

  const hubId = win.webContents.id;
  const state = { window: win, tabs: [], activeAccountId: null, previousAccountId: null };
  hubWindows.set(hubId, state);

  win.webContents.on('before-input-event', (event, input) => handleHubShortcut(state, event, input));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  let resizeSettleTimer = null;
  win.on('resize', () => {
    layoutActiveView(state);
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => nudgeActiveViewRepaint(state), 150);
  });
  win.on('maximize', () => win.webContents.send('hub:windowState', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('hub:windowState', { maximized: false }));
  // BrowserView content can freeze on a stale frame after minimize/restore; nudge its bounds to force a repaint.
  win.on('restore', () => {
    layoutActiveView(state);
    nudgeActiveViewRepaint(state);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    for (const tab of state.tabs) {
      accountHub.delete(tab.accountId);
    }
    hubWindows.delete(hubId);
  });

  return state;
}

async function openAccountTab(accountId) {
  const creds = store.getAccountCredentials(accountId);
  const accounts = store.listAccounts();
  const meta = accounts.find((a) => a.id === accountId);
  if (!creds || !meta) return;

  if (accountHub.has(accountId)) {
    const state = hubWindows.get(accountHub.get(accountId));
    if (state && !state.window.isDestroyed()) {
      setActiveTab(state, accountId);
      state.window.focus();
      return;
    }
    accountHub.delete(accountId);
  }

  const partition = `persist:account-${accountId}`;
  const ses = session.fromPartition(partition);
  await loadExtensionsIntoSession(ses);

  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.webContents.loadURL(FLYFF_URL);

  const state = getPreferredHubState() || createGameHubWindow();
  // The tab shortcuts are also registered on win.webContents, but that only fires while the
  // tab bar itself has focus - the BrowserView's webContents needs its own listener so the
  // combo still works while the game content is focused/clicked into. Resolve the owning state
  // dynamically (not captured at creation time) since tearOutTab can move this tab to another window.
  view.webContents.on('before-input-event', (event, input) => {
    const ownerState = hubWindows.get(accountHub.get(accountId));
    if (ownerState) handleHubShortcut(ownerState, event, input);
  });
  state.tabs.push({ accountId, name: meta.name, view });
  accountHub.set(accountId, state.window.webContents.id);

  if (state.window.isVisible()) {
    setActiveTab(state, accountId);
  } else {
    state.window.once('ready-to-show', () => setActiveTab(state, accountId));
  }
  state.window.focus();
}


app.whenReady().then(() => {
  createHomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createHomeWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: accounts ----
ipcMain.handle('accounts:list', () => store.listAccounts());

ipcMain.handle('accounts:save', (_evt, account) => store.upsertAccount(account));

ipcMain.handle('accounts:delete', (_evt, id) => {
  store.deleteAccount(id);
  return true;
});

ipcMain.handle('accounts:open', (_evt, id) => openAccountTab(id));

// ---- IPC: extensions ----
ipcMain.handle('extensions:list', () => store.listExtensions());

ipcMain.handle('extensions:add', async () => {
  const result = await dialog.showOpenDialog(homeWindow, {
    title: 'Select unpacked extension folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const extPath = result.filePaths[0];
  const name = path.basename(extPath);
  return store.addExtension({ name, path: extPath });
});

ipcMain.handle('extensions:remove', (_evt, id) => {
  store.removeExtension(id);
  return true;
});

// ---- IPC: Flyff Universe news feed ----
ipcMain.handle('news:fetch', async () => {
  try {
    const res = await fetch('https://universe.flyff.com/news');
    return await res.text();
  } catch (err) {
    console.error('Failed to fetch Flyff Universe news:', err.message);
    return '';
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

// ---- IPC: game hub tab strip ----
function getHubStateFromEvent(evt) {
  const win = BrowserWindow.fromWebContents(evt.sender);
  return win ? hubWindows.get(win.webContents.id) : null;
}

ipcMain.handle('hub:activateTab', (evt, accountId) => {
  const state = getHubStateFromEvent(evt);
  if (state) setActiveTab(state, accountId);
});

ipcMain.handle('hub:closeTab', (evt, accountId) => {
  const state = getHubStateFromEvent(evt);
  if (state) closeTab(state, accountId);
});

ipcMain.handle('hub:reorderTab', (evt, { accountId, targetIndex }) => {
  const state = getHubStateFromEvent(evt);
  if (state) reorderTab(state, accountId, targetIndex);
});

ipcMain.handle('hub:tearOutTab', (evt, { accountId, screenX, screenY }) => {
  const state = getHubStateFromEvent(evt);
  if (state) tearOutTab(state, accountId, screenX, screenY);
});

ipcMain.handle('hub:minimize', (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('hub:maximizeToggle', (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.handle('hub:close', (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (win && !win.isDestroyed()) win.close();
});

// ---- IPC: home window custom title bar controls ----
ipcMain.handle('window:minimize', () => {
  if (homeWindow && !homeWindow.isDestroyed()) homeWindow.minimize();
});

ipcMain.handle('window:maximizeToggle', () => {
  if (!homeWindow || homeWindow.isDestroyed()) return;
  if (homeWindow.isMaximized()) homeWindow.unmaximize();
  else homeWindow.maximize();
});

ipcMain.handle('window:close', () => {
  if (homeWindow && !homeWindow.isDestroyed()) homeWindow.close();
});

ipcMain.handle('window:openSettings', () => createSettingsWindow());

ipcMain.handle('settingsWindow:close', (evt) => {
  const owner = BrowserWindow.fromWebContents(evt.sender);
  if (owner && !owner.isDestroyed()) owner.close();
});

ipcMain.handle('settingsWindow:minimize', (evt) => {
  const owner = BrowserWindow.fromWebContents(evt.sender);
  if (owner && !owner.isDestroyed()) owner.minimize();
});

ipcMain.handle('settingsWindow:maximizeToggle', (evt) => {
  const owner = BrowserWindow.fromWebContents(evt.sender);
  if (!owner || owner.isDestroyed()) return;
  if (owner.isMaximized()) owner.unmaximize();
  else owner.maximize();
});

// ---- IPC: utility widgets (FCoin Calculator, Quest Log, Notepad, To-Do) ----
ipcMain.handle('window:openUtility', (_evt, type) => createUtilityWindow(type));

ipcMain.handle('window:openCommunityMenu', (_evt, { x, y }) => showCommunityResourcesMenu(x, y));

ipcMain.handle('widgets:get', (_evt, type) => widgetsStore.get(type));

ipcMain.handle('widgets:set', (_evt, type, data) => widgetsStore.set(type, data));

ipcMain.handle('utilityWindow:toggleMinimize', (evt) => {
  const owner = BrowserWindow.fromWebContents(evt.sender);
  if (!owner || owner.isDestroyed()) return { isCollapsed: false };

  // Mimic NeuzOS's floating-window minimize: collapse to just the titlebar instead of an OS-level minimize.
  if (owner.__isCollapsed) {
    if (owner.__normalMinSize) owner.setMinimumSize(owner.__normalMinSize[0], owner.__normalMinSize[1]);
    if (owner.__normalBounds) owner.setBounds(owner.__normalBounds);
    owner.setResizable(true);
    owner.__isCollapsed = false;
    return { isCollapsed: false };
  }

  owner.__normalBounds = owner.getBounds();
  owner.__normalMinSize = owner.getMinimumSize();
  const { x, y, width } = owner.__normalBounds;
  owner.setMinimumSize(owner.__normalMinSize[0], WIDGET_TITLEBAR_HEIGHT);
  owner.setBounds({ x, y, width, height: WIDGET_TITLEBAR_HEIGHT });
  owner.setResizable(false);
  owner.__isCollapsed = true;
  return { isCollapsed: true };
});

ipcMain.handle('utilityWindow:close', (evt) => {
  const owner = BrowserWindow.fromWebContents(evt.sender);
  if (owner && !owner.isDestroyed()) owner.close();
});

// ---- IPC: tab keybinds (swap tab, fullscreen toggle, close tab) ----
ipcMain.handle('keybinds:get', () => keybindsStore.getAll());

ipcMain.handle('keybinds:set', (_evt, action, combo) => keybindsStore.set(action, combo));

ipcMain.handle('keybinds:reset', () => keybindsStore.resetAll());
