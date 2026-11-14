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
const SPLIT_GAP = 6; // px between split-view tiles; this strip is the draggable divider
const SPLIT_MIN_TILE = 160; // px a tile can be shrunk to by dragging a divider

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
// A window can also have a split group: a set of its tabs that are tiled side by side whenever
// one of them is active (the equivalent of a NeuzOS layout). Tabs outside the group still show
// alone, full size, like normal tabs.
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

// The tabs of this window that belong to its split group, in tab order.
function splitTabs(state) {
  return state.tabs.filter((t) => state.splitGroup.has(t.accountId));
}

// True while the split group is what's on screen: it has at least two tabs here and the active
// tab is one of them.
function isSplitActive(state) {
  return state.splitGroup.has(state.activeAccountId) && splitTabs(state).length >= 2;
}

// The tabs whose game view is on screen: the whole split group while one of its tabs is active,
// otherwise just the active tab.
function visibleTabs(state) {
  if (isSplitActive(state)) return splitTabs(state);
  return state.tabs.filter((t) => t.accountId === state.activeAccountId);
}

// How split view arranges N tiles: a near-square grid, returned as the number of tiles per row.
// A short last row simply has fewer (wider) tiles, so there is never an empty slot
// (3 accounts = [2, 1]: two on top, one full-width below).
function splitShape(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const shape = [];
  for (let left = count; left > 0; left -= cols) shape.push(Math.min(cols, left));
  return shape;
}

function equalFractions(n) {
  return Array.from({ length: n }, () => 1 / n);
}

function isFractionList(list, length) {
  return Array.isArray(list) && list.length === length && list.every((f) => typeof f === 'number' && f > 0 && f < 1.0001);
}

// Split sizes are stored as fractions (row heights, and column widths per row) so they survive
// window resizes. Returns the layout if it matches the current tile count, otherwise an even one.
function getSplitLayout(state) {
  const shape = splitShape(splitTabs(state).length);
  const layout = state.splitLayout;
  const valid =
    layout &&
    isFractionList(layout.rows, shape.length) &&
    Array.isArray(layout.cols) &&
    layout.cols.length === shape.length &&
    shape.every((n, r) => isFractionList(layout.cols[r], n));
  if (!valid) state.splitLayout = { rows: equalFractions(shape.length), cols: shape.map((n) => equalFractions(n)) };
  return state.splitLayout;
}

// Pixel edges (0..total) for a list of fractions: edges[i] is where slot i starts.
function fractionEdges(fractions, total) {
  const sum = fractions.reduce((a, b) => a + b, 0) || 1;
  const edges = [0];
  let acc = 0;
  for (const f of fractions) {
    acc += f;
    edges.push(Math.round((acc / sum) * total));
  }
  edges[edges.length - 1] = total;
  return edges;
}

// Tile rectangles plus the divider strips between them, in window content coordinates.
function computeSplit(state, width, height) {
  const layout = getSplitLayout(state);
  const areaHeight = Math.max(0, height - TAB_BAR_HEIGHT);
  const half = SPLIT_GAP / 2;
  const rowEdges = fractionEdges(layout.rows, areaHeight);
  const tiles = [];
  const dividers = [];
  layout.rows.forEach((_rowFraction, r) => {
    const top = rowEdges[r] + (r > 0 ? half : 0);
    const bottom = rowEdges[r + 1] - (r < layout.rows.length - 1 ? half : 0);
    if (r > 0) {
      dividers.push({ kind: 'row', row: r, index: r, x: 0, y: TAB_BAR_HEIGHT + rowEdges[r] - half, width, height: SPLIT_GAP });
    }
    const colEdges = fractionEdges(layout.cols[r], width);
    layout.cols[r].forEach((_colFraction, c) => {
      const left = colEdges[c] + (c > 0 ? half : 0);
      const right = colEdges[c + 1] - (c < layout.cols[r].length - 1 ? half : 0);
      tiles.push({ x: left, y: TAB_BAR_HEIGHT + top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
      if (c > 0) {
        dividers.push({ kind: 'col', row: r, index: c, x: colEdges[c] - half, y: TAB_BAR_HEIGHT + top, width: SPLIT_GAP, height: Math.max(0, bottom - top) });
      }
    });
  });
  return { tiles, dividers };
}

// Moves the boundary between slot index-1 and slot index to `position` px (of `total`), keeping
// both neighbours at least SPLIT_MIN_TILE wide/tall. Only those two slots change size.
function moveBoundary(fractions, index, position, total) {
  if (index <= 0 || index >= fractions.length || total <= 0) return;
  const sum = fractions.reduce((a, b) => a + b, 0) || 1;
  const start = fractions.slice(0, index - 1).reduce((a, b) => a + b, 0) / sum;
  const end = fractions.slice(0, index + 1).reduce((a, b) => a + b, 0) / sum;
  const min = Math.min(SPLIT_MIN_TILE / total, (end - start) / 2);
  const boundary = Math.max(start + min, Math.min(end - min, position / total));
  fractions[index - 1] = (boundary - start) * sum;
  fractions[index] = (end - boundary) * sum;
}

function dragSplitDivider(state, { kind, row, index, position }) {
  if (!isSplitActive(state) || state.window.isDestroyed()) return;
  const layout = getSplitLayout(state);
  const [width, height] = state.window.getContentSize();
  if (kind === 'col' && layout.cols[row]) {
    moveBoundary(layout.cols[row], index, position, width);
  } else if (kind === 'row') {
    moveBoundary(layout.rows, index, position - TAB_BAR_HEIGHT, Math.max(0, height - TAB_BAR_HEIGHT));
  }
  layoutViews(state);
}

// Remembers the dragged sizes on the profile this window was opened from, so the split comes
// back the same way next time.
function saveSplitLayout(state) {
  if (state.profileId && state.splitLayout) store.setProfileSplitLayout(state.profileId, state.splitLayout);
}

function sendSplitDividers(state, dividers) {
  if (!state.window.isDestroyed()) state.window.webContents.send('hub:splitDividers', dividers);
}

function layoutViews(state) {
  if (state.window.isDestroyed()) return;
  const tabs = visibleTabs(state);
  if (tabs.length === 0) return;
  const [width, height] = state.window.getContentSize();
  if (!isSplitActive(state)) {
    tabs[0].view.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width, height: Math.max(0, height - TAB_BAR_HEIGHT) });
    sendSplitDividers(state, []);
    return;
  }
  const { tiles, dividers } = computeSplit(state, width, height);
  tabs.forEach((tab, i) => tab.view.setBounds(tiles[i]));
  // The divider strips are drawn (and dragged) by the hub page, which shows through the gaps.
  sendSplitDividers(state, dividers);
}

// Attaches exactly the views that should be on screen (and detaches the rest), then lays them out.
function syncViews(state) {
  if (state.window.isDestroyed()) return;
  const visible = visibleTabs(state);
  const keep = new Set(visible.map((t) => t.view));
  for (const view of [...state.attached]) {
    if (keep.has(view)) continue;
    try { state.window.removeBrowserView(view); } catch { /* view may not be attached */ }
    state.attached.delete(view);
  }
  for (const tab of visible) {
    if (state.attached.has(tab.view)) continue;
    state.window.addBrowserView(tab.view);
    // Electron's native autoResize fights with our manual layoutViews bounds calc (it anchors
    // to top-left and ignores the tab-bar y offset), which left the game's internal camera/canvas
    // sized against a stale bounds and made the character view drift off-center after a resize.
    tab.view.setAutoResize({ width: false, height: false });
    state.attached.add(tab.view);
  }
  layoutViews(state);
}

function sendTabsUpdate(state) {
  if (state.window.isDestroyed()) return;
  state.window.webContents.send('hub:tabsUpdate', {
    tabs: state.tabs.map((t) => ({ accountId: t.accountId, name: t.name })),
    activeAccountId: state.activeAccountId,
    // Which tabs are tiled together, and whether that split is what is showing right now.
    splitIds: splitTabs(state).length >= 2 ? splitTabs(state).map((t) => t.accountId) : [],
    splitActive: isSplitActive(state),
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

// Makes a tab the active one. For an ordinary tab that swaps which game is shown; for a tab in
// the split group the whole group is shown and the active one is the one holding keyboard focus.
function setActiveTab(state, accountId) {
  const tab = state.tabs.find((t) => t.accountId === accountId);
  if (!tab || state.window.isDestroyed()) return;
  if (state.activeAccountId && state.activeAccountId !== accountId) {
    state.previousAccountId = state.activeAccountId;
  }
  state.activeAccountId = accountId;
  syncViews(state);
  focusActiveSplitView(state);
  sendTabsUpdate(state);
}

// Gives keyboard focus to the active tile so key presses reach that character. Only while the
// window is already in the foreground, so this never pulls focus away from another application.
function focusActiveSplitView(state) {
  if (!isSplitActive(state) || state.window.isDestroyed() || !state.window.isFocused()) return;
  const tab = state.tabs.find((t) => t.accountId === state.activeAccountId);
  if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus();
}

// The title-bar split button: with a split group present it dissolves it (back to plain tabs),
// otherwise it tiles every tab in the window.
function toggleSplitGroup(state) {
  if (state.window.isDestroyed()) return;
  if (splitTabs(state).length >= 2) {
    state.splitGroup = new Set();
  } else {
    if (state.tabs.length < 2) return;
    state.splitGroup = new Set(state.tabs.map((t) => t.accountId));
  }
  syncViews(state);
  focusActiveSplitView(state);
  sendTabsUpdate(state);
}

// After a live resize settles, nudge each visible BrowserView's bounds by a pixel and back to force
// the game's canvas to fully reflow. Without this, the Chromium compositor can leave the character's
// camera view rendered against the pre-resize viewport, appearing off-center from the window.
function nudgeActiveViewRepaint(state) {
  if (state.window.isDestroyed()) return;
  for (const tab of visibleTabs(state)) {
    const bounds = tab.view.getBounds();
    tab.view.setBounds({ ...bounds, height: Math.max(0, bounds.height - 1) });
    setImmediate(() => {
      if (!state.window.isDestroyed() && state.attached.has(tab.view)) tab.view.setBounds(bounds);
    });
  }
}

// Removes a tab from its window without destroying the game view, so it can be re-homed in
// another window. Closes the window if that was its last tab. Returns the removed tab.
function detachTab(state, accountId) {
  const idx = state.tabs.findIndex((t) => t.accountId === accountId);
  if (idx === -1) return null;
  const [tab] = state.tabs.splice(idx, 1);
  if (!state.window.isDestroyed()) {
    try { state.window.removeBrowserView(tab.view); } catch { /* already detached */ }
  }
  state.attached.delete(tab.view);
  state.splitGroup.delete(accountId);
  accountHub.delete(accountId);
  if (state.previousAccountId === accountId) state.previousAccountId = null;

  if (state.tabs.length === 0) {
    state.activeAccountId = null;
    if (!state.window.isDestroyed()) state.window.close();
    return tab;
  }
  if (state.activeAccountId === accountId) {
    const next = state.tabs[Math.max(0, idx - 1)] || state.tabs[0];
    setActiveTab(state, next.accountId);
  } else {
    syncViews(state);
    sendTabsUpdate(state);
  }
  return tab;
}

// Runs fn once the hub window is on screen (immediately if it already is).
function whenShown(state, fn) {
  if (state.window.isVisible()) fn();
  else state.window.once('ready-to-show', fn);
}

function attachTab(state, tab, { activate = true } = {}) {
  state.tabs.push(tab);
  accountHub.set(tab.accountId, state.window.webContents.id);
  if (activate) whenShown(state, () => setActiveTab(state, tab.accountId));
}

function closeTab(state, accountId) {
  detachTab(state, accountId);
}

function reorderTab(state, accountId, targetIndex) {
  const currentIndex = state.tabs.findIndex((t) => t.accountId === accountId);
  if (currentIndex === -1) return;
  const [tab] = state.tabs.splice(currentIndex, 1);
  const nextIndex = Math.max(0, Math.min(targetIndex, state.tabs.length));
  state.tabs.splice(nextIndex, 0, tab);
  // The order of the split group's tabs is also the order of their tiles.
  if (isSplitActive(state)) layoutViews(state);
  sendTabsUpdate(state);
}

function tearOutTab(state, accountId, screenX, screenY) {
  if (!state.tabs.some((t) => t.accountId === accountId)) return;

  if (state.tabs.length === 1) {
    // Already alone in its own window - just move that window under the cursor.
    state.window.setPosition(Math.round(screenX - 60), Math.round(screenY - 10));
    state.window.focus();
    return;
  }

  const tab = detachTab(state, accountId);
  const newState = createGameHubWindow({ x: Math.round(screenX - 60), y: Math.round(screenY - 10) });
  attachTab(newState, tab);
}

function getPreferredHubState() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && hubWindows.has(focused.webContents.id)) return hubWindows.get(focused.webContents.id);
  const first = hubWindows.values().next();
  return first.done ? null : first.value;
}

function createGameHubWindow(position, { splitLayout = null, profileId = null } = {}) {
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
  const state = { window: win, tabs: [], activeAccountId: null, previousAccountId: null, splitGroup: new Set(), splitLayout, profileId, attached: new Set() };
  hubWindows.set(hubId, state);

  win.webContents.on('before-input-event', (event, input) => handleHubShortcut(state, event, input));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  let resizeSettleTimer = null;
  win.on('resize', () => {
    layoutViews(state);
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => nudgeActiveViewRepaint(state), 150);
  });
  win.on('maximize', () => win.webContents.send('hub:windowState', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('hub:windowState', { maximized: false }));
  // BrowserView content can freeze on a stale frame after minimize/restore; nudge its bounds to force a repaint.
  win.on('restore', () => {
    layoutViews(state);
    nudgeActiveViewRepaint(state);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Coming back to the window (alt-tab, clicking its title bar) hands the keys to the active tile.
  win.on('focus', () => focusActiveSplitView(state));
  win.on('closed', () => {
    for (const tab of state.tabs) {
      accountHub.delete(tab.accountId);
    }
    hubWindows.delete(hubId);
  });

  return state;
}

// Builds the game view for an account (its own persistent session + extensions). Returns a tab
// object that is not yet placed in any window, or null if the account no longer exists.
async function createAccountTab(accountId) {
  const creds = store.getAccountCredentials(accountId);
  const meta = store.listAccounts().find((a) => a.id === accountId);
  if (!creds || !meta) return null;

  const partition = `persist:account-${accountId}`;
  const ses = session.fromPartition(partition);
  await loadExtensionsIntoSession(ses);

  const view = new BrowserView({
    webPreferences: {
      partition,
      preload: path.join(__dirname, 'preload-game.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.webContents.loadURL(FLYFF_URL);

  // The tab shortcuts are also registered on win.webContents, but that only fires while the
  // tab bar itself has focus - the BrowserView's webContents needs its own listener so the
  // combo still works while the game content is focused/clicked into. Resolve the owning state
  // dynamically (not captured at creation time) since a tab can be moved to another window.
  view.webContents.on('before-input-event', (event, input) => {
    const ownerState = hubWindows.get(accountHub.get(accountId));
    if (ownerState) handleHubShortcut(ownerState, event, input);
  });
  return { accountId, name: meta.name, view };
}

// The live window an account is currently open in, or null.
function getOwnerState(accountId) {
  if (!accountHub.has(accountId)) return null;
  const state = hubWindows.get(accountHub.get(accountId));
  if (state && !state.window.isDestroyed()) return state;
  accountHub.delete(accountId);
  return null;
}

async function openAccountTab(accountId) {
  const owner = getOwnerState(accountId);
  if (owner) {
    setActiveTab(owner, accountId);
    owner.window.focus();
    return;
  }

  const tab = await createAccountTab(accountId);
  if (!tab) return;
  const state = getPreferredHubState() || createGameHubWindow();
  attachTab(state, tab);
  state.window.focus();
}

// Opens every account linked to a launch profile, then lands on the profile's first account.
// Accounts that are already open are reused rather than reloaded. A profile with split accounts
// gets its own window where those accounts are tiled side by side and the rest are ordinary tabs.
async function openProfile(profileId) {
  const profile = store.getProfile(profileId);
  if (!profile || profile.accountIds.length === 0) return { opened: 0 };
  if (profile.splitIds.length >= 2) return openProfileSplit(profile);

  let opened = 0;
  for (const accountId of profile.accountIds) {
    try {
      await openAccountTab(accountId);
      if (accountHub.has(accountId)) opened += 1;
    } catch (err) {
      console.error(`Failed to open account ${accountId} for profile "${profile.name}":`, err.message);
    }
  }

  const firstId = profile.accountIds.find((id) => accountHub.has(id));
  const state = firstId ? getOwnerState(firstId) : null;
  if (state) {
    whenShown(state, () => setActiveTab(state, firstId));
    state.window.focus();
  }
  return { opened };
}

async function openProfileSplit(profile) {
  // Reuse this profile's window if it is still open; anything missing is added back to it.
  let state = [...hubWindows.values()].find((s) => s.profileId === profile.id && !s.window.isDestroyed()) || null;

  // Gather the tabs first: accounts already open elsewhere are moved over, the rest are created.
  const tabs = [];
  for (const accountId of profile.accountIds) {
    try {
      const owner = getOwnerState(accountId);
      if (owner && owner === state) continue;
      const tab = owner ? detachTab(owner, accountId) : await createAccountTab(accountId);
      if (tab) tabs.push(tab);
    } catch (err) {
      console.error(`Failed to open account ${accountId} for profile "${profile.name}":`, err.message);
    }
  }

  if (state && state.window.isDestroyed()) state = null;
  if (!state) {
    if (tabs.length === 0) return { opened: 0 };
    state = createGameHubWindow(undefined, { splitLayout: profile.splitLayout, profileId: profile.id });
  }
  for (const tab of tabs) attachTab(state, tab, { activate: false });
  state.splitGroup = new Set(profile.splitIds);

  // Land on the split so it is the first thing on screen.
  const target = state;
  const firstId = (splitTabs(target)[0] || target.tabs[0]).accountId;
  whenShown(target, () => {
    if (target.window.isMinimized()) target.window.restore();
    target.window.focus();
    setActiveTab(target, firstId);
  });
  return { opened: target.tabs.length };
}

// Split view "focus follows mouse": each game view reports when the pointer moves over it (see
// preload-game.js). If it is not the one holding keyboard focus, make it the active tile so key
// presses go to the character under the cursor without a click.
ipcMain.on('game:hover', (evt) => {
  for (const state of hubWindows.values()) {
    const tab = state.tabs.find((t) => t.view.webContents === evt.sender);
    if (!tab) continue;
    const canFocus = isSplitActive(state) && state.splitGroup.has(tab.accountId) && !state.window.isDestroyed() && state.window.isFocused();
    if (canFocus && !tab.view.webContents.isFocused()) setActiveTab(state, tab.accountId);
    return;
  }
});


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

// ---- IPC: launch profiles (open a saved set of accounts at once) ----
ipcMain.handle('profiles:list', () => store.listProfiles());

ipcMain.handle('profiles:save', (_evt, profile) => store.upsertProfile(profile));

ipcMain.handle('profiles:delete', (_evt, id) => {
  store.deleteProfile(id);
  return true;
});

ipcMain.handle('profiles:open', (_evt, id) => openProfile(id));

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

ipcMain.handle('hub:toggleSplit', (evt) => {
  const state = getHubStateFromEvent(evt);
  if (state) toggleSplitGroup(state);
});

ipcMain.on('hub:dragDivider', (evt, payload) => {
  const state = getHubStateFromEvent(evt);
  if (state && payload) dragSplitDivider(state, payload);
});

ipcMain.on('hub:dragDividerEnd', (evt) => {
  const state = getHubStateFromEvent(evt);
  if (!state) return;
  saveSplitLayout(state);
  // The drag started on the hub page, so give the keys back to the active character.
  focusActiveSplitView(state);
});

ipcMain.handle('hub:resetSplit', (evt) => {
  const state = getHubStateFromEvent(evt);
  if (!state || !isSplitActive(state)) return;
  state.splitLayout = null;
  layoutViews(state);
  saveSplitLayout(state);
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
