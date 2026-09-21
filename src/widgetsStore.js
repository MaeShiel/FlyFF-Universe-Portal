// Simple local JSON store for lightweight widget data (FCoin rate, notepad text,
// quest log / to-do items). Not sensitive, so no encryption needed.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = () => path.join(app.getPath('userData'), 'widgets-data.json');

const DEFAULTS = {
  fcoin: { rate: 180000000 },
  questlog: { items: [] },
  notepad: { content: '' },
  todo: { items: [] },
};

let cache = null;

function load() {
  try {
    if (fs.existsSync(DATA_FILE())) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE(), 'utf-8')) };
    }
  } catch (err) {
    console.error('Failed to load widgets data:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function getData() {
  if (!cache) cache = load();
  return cache;
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to save widgets data:', err);
  }
}

function get(type) {
  return getData()[type] ?? null;
}

function set(type, data) {
  const store = getData();
  store[type] = data;
  persist();
  return store[type];
}

module.exports = { get, set };
