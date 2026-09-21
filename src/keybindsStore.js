// Simple local JSON store for user-configurable tab keybinds (swap tab, fullscreen, close tab).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = () => path.join(app.getPath('userData'), 'keybinds-data.json');

const DEFAULTS = {
  swapTab: 'ctrl+tab',
  toggleFullscreen: 'f11',
  closeTab: 'ctrl+w',
};

let cache = null;

function load() {
  try {
    if (fs.existsSync(DATA_FILE())) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE(), 'utf-8')) };
    }
  } catch (err) {
    console.error('Failed to load keybinds data:', err);
  }
  return { ...DEFAULTS };
}

function getData() {
  if (!cache) cache = load();
  return cache;
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to save keybinds data:', err);
  }
}

function getAll() {
  return { ...getData() };
}

function set(action, combo) {
  if (!(action in DEFAULTS)) return null;
  const store = getData();
  store[action] = combo;
  persist();
  return store[action];
}

function resetAll() {
  cache = { ...DEFAULTS };
  persist();
  return getAll();
}

module.exports = { getAll, set, resetAll, DEFAULTS };
