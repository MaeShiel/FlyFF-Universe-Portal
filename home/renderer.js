const accountsGrid = document.getElementById('accountsGrid');
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
      btn.classList.toggle('selected', accIconInput.value === icon.file);
      const img = document.createElement('img');
      img.src = iconUrl(icon.file);
      img.alt = icon.name;
      btn.appendChild(img);
      btn.addEventListener('click', () => {
        accIconInput.value = icon.file;
        pickIconPreview.src = iconUrl(icon.file);
        iconPickerModal.classList.add('hidden');
      });
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    iconPickerBody.appendChild(section);
  }
}

document.getElementById('pickIconBtn').addEventListener('click', () => {
  iconSearchInput.value = '';
  renderIconGrid();
  iconPickerModal.classList.remove('hidden');
});
document.getElementById('closeIconPickerBtn').addEventListener('click', () => iconPickerModal.classList.add('hidden'));
iconSearchInput.addEventListener('input', () => renderIconGrid(iconSearchInput.value));

async function refreshAccounts() {
  const accounts = await window.flyffAPI.listAccounts();
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
}

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
  panel.className = 'news-panel';

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
