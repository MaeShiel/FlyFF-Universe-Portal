// Encrypted local storage for accounts and extensions.
// Uses Electron's safeStorage (OS keychain / DPAPI) to encrypt data at rest.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const DATA_FILE = () => path.join(app.getPath('userData'), 'flyff-data.enc');
const PLAIN_FALLBACK_FILE = () => path.join(app.getPath('userData'), 'flyff-data.json');

const DEFAULT_DATA = { accounts: [], extensions: [] };

function load() {
  const encPath = DATA_FILE();
  try {
    if (fs.existsSync(encPath) && safeStorage.isEncryptionAvailable()) {
      const buf = fs.readFileSync(encPath);
      const json = safeStorage.decryptString(buf);
      return JSON.parse(json);
    }
    // Fallback (no OS encryption available) - only used if safeStorage is unsupported.
    if (fs.existsSync(PLAIN_FALLBACK_FILE())) {
      return JSON.parse(fs.readFileSync(PLAIN_FALLBACK_FILE(), 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load account data:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function save(data) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(JSON.stringify(data));
      fs.writeFileSync(DATA_FILE(), buf);
      // Remove any stale plaintext fallback file from earlier runs.
      if (fs.existsSync(PLAIN_FALLBACK_FILE())) fs.unlinkSync(PLAIN_FALLBACK_FILE());
    } else {
      fs.writeFileSync(PLAIN_FALLBACK_FILE(), JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Failed to save account data:', err);
  }
}

let cache = null;
function getData() {
  if (!cache) cache = load();
  return cache;
}
function persist() {
  save(cache);
}

function listAccounts() {
  return getData().accounts.map((a) => ({ id: a.id, name: a.name, username: a.username, icon: a.icon || 'jobs/vagrant.png', notes: a.notes || '' }));
}

function getAccountCredentials(id) {
  const acc = getData().accounts.find((a) => a.id === id);
  if (!acc) return null;
  return { username: acc.username, password: acc.password };
}

function upsertAccount(account) {
  const data = getData();
  if (account.id) {
    const idx = data.accounts.findIndex((a) => a.id === account.id);
    if (idx >= 0) {
      data.accounts[idx] = { ...data.accounts[idx], ...account };
      persist();
      return data.accounts[idx];
    }
  }
  const newAccount = {
    id: crypto.randomUUID(),
    name: account.name,
    username: account.username || '',
    password: account.password || '',
    icon: account.icon || 'jobs/vagrant.png',
    notes: account.notes || '',
  };
  data.accounts.push(newAccount);
  persist();
  return newAccount;
}

function deleteAccount(id) {
  const data = getData();
  data.accounts = data.accounts.filter((a) => a.id !== id);
  // Drop the deleted account from any launch profile that referenced it.
  for (const profile of data.profiles || []) {
    profile.accountIds = (profile.accountIds || []).filter((accountId) => accountId !== id);
  }
  persist();
}

// ---- Launch profiles: a named set of accounts opened together (e.g. "Dailies Hunting") ----
function getProfiles() {
  const data = getData();
  if (!Array.isArray(data.profiles)) data.profiles = [];
  return data.profiles;
}

// Keeps only ids of accounts that still exist, de-duplicated, in the given order.
function sanitizeAccountIds(accountIds) {
  const known = new Set(getData().accounts.map((a) => a.id));
  return [...new Set(Array.isArray(accountIds) ? accountIds : [])].filter((id) => known.has(id));
}

// The accounts of a profile that are tiled side by side. A split needs at least two accounts.
// Profiles saved before per-account split existed only have `split: true`, meaning all of them.
function sanitizeSplitIds(splitIds, accountIds, legacySplitAll) {
  const linked = new Set(accountIds);
  const ids = Array.isArray(splitIds)
    ? [...new Set(splitIds)].filter((id) => linked.has(id))
    : legacySplitAll ? [...accountIds] : [];
  return ids.length >= 2 ? ids : [];
}

function listProfiles() {
  return getProfiles().map((p) => {
    const accountIds = sanitizeAccountIds(p.accountIds);
    return {
      id: p.id,
      name: p.name,
      icon: p.icon || 'jobs/vagrant.png',
      accountIds,
      splitIds: sanitizeSplitIds(p.splitIds, accountIds, Boolean(p.split)),
      splitLayout: p.splitLayout || null,
    };
  });
}

function getProfile(id) {
  return listProfiles().find((p) => p.id === id) || null;
}

function upsertProfile(profile) {
  const profiles = getProfiles();
  const accountIds = sanitizeAccountIds(profile.accountIds);
  const splitIds = sanitizeSplitIds(profile.splitIds, accountIds, false);
  const fields = {
    name: String(profile.name || '').trim() || 'Untitled Profile',
    icon: profile.icon || 'jobs/vagrant.png',
    accountIds,
    splitIds,
    split: splitIds.length >= 2,
  };
  const idx = profile.id ? profiles.findIndex((p) => p.id === profile.id) : -1;
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...fields };
    persist();
    return profiles[idx];
  }
  const newProfile = { id: crypto.randomUUID(), ...fields };
  profiles.push(newProfile);
  persist();
  return newProfile;
}

// Saved divider positions for a split-view profile (fractions; see computeSplit in main.js).
function setProfileSplitLayout(id, splitLayout) {
  const profile = getProfiles().find((p) => p.id === id);
  if (!profile) return;
  profile.splitLayout = splitLayout;
  persist();
}

function deleteProfile(id) {
  const data = getData();
  data.profiles = getProfiles().filter((p) => p.id !== id);
  persist();
}

function listExtensions() {
  return getData().extensions;
}

function addExtension(ext) {
  const data = getData();
  const entry = { id: crypto.randomUUID(), name: ext.name, path: ext.path };
  data.extensions.push(entry);
  persist();
  return entry;
}

function removeExtension(id) {
  const data = getData();
  data.extensions = data.extensions.filter((e) => e.id !== id);
  persist();
}

module.exports = {
  listAccounts,
  getAccountCredentials,
  upsertAccount,
  deleteAccount,
  listProfiles,
  getProfile,
  upsertProfile,
  deleteProfile,
  setProfileSplitLayout,
  listExtensions,
  addExtension,
  removeExtension,
};
