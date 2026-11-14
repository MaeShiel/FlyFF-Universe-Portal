const accountsGrid = document.getElementById('accountsGrid');
let accountsCache = []; // last loaded account list, reused by the profile cards and dialog
const accountModal = document.getElementById('accountModal');
const accountForm = document.getElementById('accountForm');
const modalTitle = document.getElementById('modalTitle');
const currentVersion = document.getElementById('currentVersion');

document.getElementById('settingsBtn').addEventListener('click', () => window.flyffAPI.openSettings());
document.getElementById('minimizeBtn').addEventListener('click', () => window.flyffAPI.minimizeWindow());
document.getElementById('maximizeBtn').addEventListener('click', () => window.flyffAPI.toggleMaximizeWindow());
document.getElementById('closeBtn').addEventListener('click', () => window.flyffAPI.closeWindow());

const widgetMenuBtn = document.getElementById('widgetMenuBtn');
const widgetMenu = document.getElementById('widgetMenu');

widgetMenuBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  const isHidden = widgetMenu.classList.toggle('hidden');
  widgetMenuBtn.setAttribute('aria-expanded', String(!isHidden));
});

widgetMenu.querySelectorAll('[data-widget]').forEach((button) => {
  button.addEventListener('click', () => {
    window.flyffAPI.openUtility(button.dataset.widget);
    widgetMenu.classList.add('hidden');
    widgetMenuBtn.setAttribute('aria-expanded', 'false');
  });
});

document.getElementById('communityMenuItem').addEventListener('click', (event) => {
  window.flyffAPI.openCommunityMenu({ x: Math.round(event.screenX), y: Math.round(event.screenY) });
  widgetMenu.classList.add('hidden');
  widgetMenuBtn.setAttribute('aria-expanded', 'false');
});

document.addEventListener('click', () => {
  widgetMenu.classList.add('hidden');
  widgetMenuBtn.setAttribute('aria-expanded', 'false');
});

const iconPickerModal = document.getElementById('iconPickerModal');
const iconPickerBody = document.getElementById('iconPickerBody');
const iconSearchInput = document.getElementById('iconSearchInput');
const accIconInput = document.getElementById('accIcon');
const pickIconPreview = document.getElementById('pickIconPreview');

// The icon picker is shared by the account and profile dialogs; this points at whichever
// hidden input + preview image opened it.
let iconPickerTarget = { input: accIconInput, preview: pickIconPreview };

function openIconPicker(input, preview) {
  iconPickerTarget = { input, preview };
  iconSearchInput.value = '';
  renderIconGrid();
  iconPickerModal.classList.remove('hidden');
}

function iconUrl(file) {
  return `../assets/icons/${file}`;
}

function renderIconGrid(filter = '') {
  const term = filter.trim().toLowerCase();
  iconPickerBody.innerHTML = '';
  for (const category of ICON_CATEGORIES) {
    const icons = term
      ? category.icons.filter((i) => i.name.toLowerCase().includes(term))
      : category.icons;
    if (icons.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'icon-category';
    const label = document.createElement('div');
    label.className = 'icon-category-label';
    label.textContent = category.label;
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'icon-grid';
    for (const icon of icons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = icon.name;
      btn.classList.toggle('selected', iconPickerTarget.input.value === icon.file);
      const img = document.createElement('img');
      img.src = iconUrl(icon.file);
      img.alt = icon.name;
      btn.appendChild(img);
      btn.addEventListener('click', () => {
        iconPickerTarget.input.value = icon.file;
        iconPickerTarget.preview.src = iconUrl(icon.file);
        iconPickerModal.classList.add('hidden');
      });
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    iconPickerBody.appendChild(section);
  }
}

document.getElementById('pickIconBtn').addEventListener('click', () => openIconPicker(accIconInput, pickIconPreview));
document.getElementById('closeIconPickerBtn').addEventListener('click', () => iconPickerModal.classList.add('hidden'));
iconSearchInput.addEventListener('input', () => renderIconGrid(iconSearchInput.value));

async function refreshAccounts() {
  const accounts = await window.flyffAPI.listAccounts();
  accountsCache = accounts;
  accountsGrid.innerHTML = '';
  for (const acc of accounts) {
    const card = document.createElement('div');
    card.className = 'account-card';
    card.innerHTML = `
      <div class="header-row">
        <img class="icon" alt="" />
        <div class="name"></div>
      </div>
      <div class="username"></div>
      <div class="actions">
        <button class="primary-btn" data-action="open">Open</button>
        <button class="secondary-btn" data-action="edit">Edit</button>
        <button class="danger-btn" data-action="delete">Delete</button>
      </div>
    `;
    card.querySelector('.icon').src = iconUrl(acc.icon || DEFAULT_ICON);
    card.querySelector('.name').textContent = acc.name;
    card.querySelector('.username').textContent = acc.username;

    card.querySelector('[data-action="open"]').addEventListener('click', () => window.flyffAPI.openAccount(acc.id));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openModalForEdit(acc));
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (confirm(`Delete account "${acc.name}"?`)) {
        await window.flyffAPI.deleteAccount(acc.id);
        refreshAccounts();
      }
    });
    accountsGrid.appendChild(card);
  }
  // Profile cards show their accounts' names/icons, so redraw them whenever accounts change.
  await refreshProfiles();
}

// ---- Launch profiles: a named set of accounts that all open together ----
const profileTabs = document.getElementById('profileTabs');
const profileModal = document.getElementById('profileModal');
const profileForm = document.getElementById('profileForm');
const profileModalTitle = document.getElementById('profileModalTitle');
const profileIconInput = document.getElementById('profileIcon');
const pickProfileIconPreview = document.getElementById('pickProfileIconPreview');
const profileAccountsList = document.getElementById('profileAccountsList');

// Profiles live in the top bar: one tab per profile. Click opens all of its accounts,
// right-click opens the edit dialog (which also holds Delete).
async function refreshProfiles() {
  const profiles = await window.flyffAPI.listProfiles();
  const accountsById = new Map(accountsCache.map((a) => [a.id, a]));
  profileTabs.innerHTML = '';

  for (const profile of profiles) {
    const members = profile.accountIds.map((id) => accountsById.get(id)).filter(Boolean);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'profile-tab';
    tab.classList.toggle('empty', members.length === 0);
    tab.title = (members.length > 0
      ? `Open ${members.map((a) => a.name).join(', ')}`
      : 'No accounts linked yet') + (profile.splitIds.length >= 2 ? `\nSplit: ${profile.splitIds.map((id) => accountsById.get(id)?.name).filter(Boolean).join(' + ')}` : '') + '\nRight-click to edit';
    const tabIcon = document.createElement('img');
    tabIcon.src = iconUrl(profile.icon || DEFAULT_ICON);
    tabIcon.alt = '';
    const tabLabel = document.createElement('span');
    tabLabel.textContent = profile.name;
    tab.append(tabIcon, tabLabel);
    tab.addEventListener('click', async () => {
      // A profile with nothing linked has nothing to open, so go straight to editing it.
      if (members.length === 0) return openProfileModal(profile);
      tab.disabled = true;
      try {
        await window.flyffAPI.openProfile(profile.id);
      } finally {
        tab.disabled = false;
      }
    });
    tab.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openProfileModal(profile);
    });
    profileTabs.appendChild(tab);
  }
}

function openProfileModal(profile) {
  profileModalTitle.textContent = profile ? 'Edit Profile' : 'Add Profile';
  document.getElementById('profileId').value = profile ? profile.id : '';
  document.getElementById('profileName').value = profile ? profile.name : '';
  const icon = (profile && profile.icon) || DEFAULT_ICON;
  profileIconInput.value = icon;
  pickProfileIconPreview.src = iconUrl(icon);

  const selected = new Set(profile ? profile.accountIds : []);
  profileAccountsList.innerHTML = '';
  if (accountsCache.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-accounts-empty';
    empty.textContent = 'Add an account first, then link it to this profile.';
    profileAccountsList.appendChild(empty);
  }
  const split = new Set(profile ? profile.splitIds : []);
  for (const acc of accountsCache) {
    const row = document.createElement('div');
    row.className = 'profile-account-row';

    const option = document.createElement('label');
    option.className = 'profile-account-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'profile-account-link';
    checkbox.value = acc.id;
    checkbox.checked = selected.has(acc.id);
    const img = document.createElement('img');
    img.src = iconUrl(acc.icon || DEFAULT_ICON);
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = acc.name;
    option.append(checkbox, img, name);

    // Per-account split toggle; only meaningful for accounts the profile actually opens.
    const splitToggle = document.createElement('label');
    splitToggle.className = 'profile-split-toggle';
    splitToggle.title = 'Show this account side by side with the other Split accounts';
    const splitBox = document.createElement('input');
    splitBox.type = 'checkbox';
    splitBox.className = 'profile-account-split';
    splitBox.value = acc.id;
    splitBox.checked = checkbox.checked && split.has(acc.id);
    splitBox.disabled = !checkbox.checked;
    splitToggle.appendChild(splitBox);
    checkbox.addEventListener('change', () => {
      splitBox.disabled = !checkbox.checked;
      if (!checkbox.checked) splitBox.checked = false;
    });

    row.append(option, splitToggle);
    profileAccountsList.appendChild(row);
  }
  deleteProfileBtn.classList.toggle('hidden', !profile);
  profileModal.classList.remove('hidden');
  document.getElementById('profileName').focus();
}

document.getElementById('addProfileBtn').addEventListener('click', () => openProfileModal(null));

const deleteProfileBtn = document.getElementById('deleteProfileBtn');
deleteProfileBtn.addEventListener('click', async () => {
  const id = document.getElementById('profileId').value;
  const name = document.getElementById('profileName').value.trim();
  if (!id || !confirm(`Delete profile "${name}"? The accounts themselves are kept.`)) return;
  await window.flyffAPI.deleteProfile(id);
  profileModal.classList.add('hidden');
  refreshProfiles();
});
document.getElementById('cancelProfileModalBtn').addEventListener('click', () => profileModal.classList.add('hidden'));
document.getElementById('pickProfileIconBtn').addEventListener('click', () => openIconPicker(profileIconInput, pickProfileIconPreview));

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountIds = [...profileAccountsList.querySelectorAll('.profile-account-link:checked')].map((c) => c.value);
  const splitIds = [...profileAccountsList.querySelectorAll('.profile-account-split:checked')].map((c) => c.value);
  if (splitIds.length === 1) {
    alert('Split needs at least two accounts. Turn on Split for one more account, or turn it off.');
    return;
  }
  await window.flyffAPI.saveProfile({
    id: document.getElementById('profileId').value || undefined,
    name: document.getElementById('profileName').value.trim(),
    icon: profileIconInput.value || DEFAULT_ICON,
    accountIds,
    splitIds,
  });
  profileModal.classList.add('hidden');
  refreshProfiles();
});

function openModalForAdd() {
  modalTitle.textContent = 'Add Account';
  accountForm.reset();
  document.getElementById('accountId').value = '';
  accIconInput.value = DEFAULT_ICON;
  pickIconPreview.src = iconUrl(DEFAULT_ICON);
  accountModal.classList.remove('hidden');
}

function openModalForEdit(acc) {
  modalTitle.textContent = 'Edit Account';
  document.getElementById('accountId').value = acc.id;
  document.getElementById('accName').value = acc.name;
  document.getElementById('accUsername').value = acc.username;
  document.getElementById('accPassword').value = '';
  accIconInput.value = acc.icon || DEFAULT_ICON;
  pickIconPreview.src = iconUrl(acc.icon || DEFAULT_ICON);
  document.getElementById('accNotes').value = acc.notes || '';
  accountModal.classList.remove('hidden');
}

document.getElementById('addAccountBtn').addEventListener('click', openModalForAdd);
document.getElementById('cancelModalBtn').addEventListener('click', () => accountModal.classList.add('hidden'));

accountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('accountId').value || undefined;
  const password = document.getElementById('accPassword').value;
  const account = {
    id,
    name: document.getElementById('accName').value.trim(),
    username: document.getElementById('accUsername').value.trim(),
    icon: accIconInput.value || DEFAULT_ICON,
    notes: document.getElementById('accNotes').value.trim(),
  };
  // Only include password if the user typed a new one; otherwise keep the existing one untouched.
  if (password || !id) account.password = password;

  await window.flyffAPI.saveAccount(account);
  accountModal.classList.add('hidden');
  refreshAccounts();
});

// ---- Flyff Universe news feed ----
const newsTabsEl = document.getElementById('newsTabs');
const newsPanelsEl = document.getElementById('newsPanels');
const refreshNewsBtn = document.getElementById('refreshNewsBtn');

const NEWS_TABS = [
  { key: 'updates', navId: 'nav-1', label: 'Latest Updates' },
  { key: 'events', navId: 'nav-2', label: 'Latest Events' },
  { key: 'shop', navId: 'nav-3', label: 'Latest Shop Updates' },
];

let activeNewsTab = 'updates';
let newsData = { latest: { updates: [], events: [], shop: [] }, older: { updates: [], events: [], shop: [] } };
let newsLoading = true;

function parseFlyffDomLatest(newsElement) {
  const items = [];
  newsElement.querySelectorAll('div > div > a').forEach((news) => {
    const link = news.getAttribute('href') || '';
    const imageSrc = news.querySelector('img')?.getAttribute('src') || '';
    const title = news.querySelector('div > h5')?.textContent || '';
    const summary = news.querySelector('div > h6')?.textContent || '';
    items.push({ title, link, imageSrc, summary });
  });
  return items;
}

function parseFlyffDomOlder(newsElement) {
  const items = [];
  newsElement.querySelectorAll('li > a > div').forEach((news) => {
    const link = news.parentElement?.getAttribute('href') || '';
    const imageSrc = news.querySelector('div:first-child > img')?.getAttribute('src') || '';
    const title = news.querySelector('div:nth-child(2) > h5')?.textContent || '';
    const summary = news.querySelector('div:nth-child(2) > h6')?.textContent || '';
    items.push({ title, link, imageSrc, summary });
  });
  return items;
}

function newsCard(item) {
  const card = document.createElement('div');
  card.className = 'news-card';
  card.innerHTML = `
    <img class="news-card-img" alt="" />
    <div class="news-card-body">
      <a class="news-card-title" target="_blank" rel="noopener noreferrer"></a>
      <p class="news-card-summary"></p>
    </div>
  `;
  card.querySelector('.news-card-img').src = item.imageSrc;
  const titleLink = card.querySelector('.news-card-title');
  titleLink.textContent = item.title;
  titleLink.href = item.link;
  card.querySelector('.news-card-summary').textContent = item.summary;
  return card;
}

function renderNewsPanels() {
  newsPanelsEl.innerHTML = '';
  const tab = NEWS_TABS.find((t) => t.key === activeNewsTab);
  const panel = document.createElement('div');
  panel.className = `news-panel news-panel-${activeNewsTab}`;

  const header = document.createElement('div');
  header.className = 'news-panel-header';
  header.textContent = tab.label;
  panel.appendChild(header);

  if (newsLoading) {
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = 'Loading news...';
    panel.appendChild(loading);
  } else {
    const latest = newsData.latest[activeNewsTab] || [];
    const older = newsData.older[activeNewsTab] || [];

    if (latest.length === 0 && older.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No news available right now.';
      panel.appendChild(empty);
    }

    if (latest.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'news-grid';
      latest.forEach((item) => grid.appendChild(newsCard(item)));
      panel.appendChild(grid);
    }
    if (older.length > 0) {
      const list = document.createElement('div');
      list.className = 'news-list';
      older.forEach((item) => list.appendChild(newsCard(item)));
      panel.appendChild(list);
    }
  }

  newsPanelsEl.appendChild(panel);
}

async function fetchFlyffNews() {
  newsLoading = true;
  renderNewsPanels();
  refreshNewsBtn.disabled = true;

  const html = await window.flyffAPI.fetchNews();
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const tab of NEWS_TABS) {
      const latestEl = doc.querySelector(`#${tab.navId} > div`);
      newsData.latest[tab.key] = latestEl ? parseFlyffDomLatest(latestEl) : [];
      const olderEl = doc.querySelector(`#${tab.navId} > ul`);
      newsData.older[tab.key] = olderEl ? parseFlyffDomOlder(olderEl) : [];
    }
  }
  newsLoading = false;
  refreshNewsBtn.disabled = false;
  renderNewsPanels();
}

newsTabsEl.querySelectorAll('.news-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeNewsTab = btn.dataset.tab;
    newsTabsEl.querySelectorAll('.news-tab').forEach((b) => b.classList.toggle('active', b === btn));
    renderNewsPanels();
  });
});

refreshNewsBtn.addEventListener('click', fetchFlyffNews);

fetchFlyffNews();

window.flyffAPI.getVersion().then((version) => {
  currentVersion.textContent = `Current Version ${version}`;
}).catch(() => {});

refreshAccounts();
