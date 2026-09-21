const params = new URLSearchParams(window.location.search);
const type = params.get('type');
const title = params.get('title') || 'Widget';

document.getElementById('widgetTitle').textContent = title;

const MINIMIZE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const MAXIMIZE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

const minimizeBtn = document.getElementById('widgetMinimizeBtn');
minimizeBtn.addEventListener('click', async () => {
  const { isCollapsed } = await window.utilityAPI.toggleMinimize();
  minimizeBtn.innerHTML = isCollapsed ? MAXIMIZE_ICON : MINIMIZE_ICON;
  minimizeBtn.title = isCollapsed ? 'Maximize' : 'Minimize';
  minimizeBtn.setAttribute('aria-label', minimizeBtn.title);
});
document.getElementById('widgetCloseBtn').addEventListener('click', () => {
  window.utilityAPI.closeWindow();
});

const body = document.getElementById('widgetBody');

function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function parseNumber(str) {
  const cleaned = String(str).replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function initFcoin() {
  const data = (await window.utilityAPI.getData('fcoin')) || { rate: 180000000 };
  let rate = data.rate || 180000000;
  let fcoin = 0;
  let penya = 0;

  body.innerHTML = `
    <div class="widget-field">
      <label>Rate (Penya per 1,000 FCoin)</label>
      <input id="rateInput" type="text" value="${formatNumber(rate)}" />
    </div>
    <div class="widget-field">
      <label>FCoin</label>
      <input id="fcoinInput" type="text" value="0" />
    </div>
    <div class="widget-field">
      <label>Penya</label>
      <input id="penyaInput" type="text" value="0" />
    </div>
    <div class="widget-hint-box" id="rateHint"></div>
  `;

  const rateInput = document.getElementById('rateInput');
  const fcoinInput = document.getElementById('fcoinInput');
  const penyaInput = document.getElementById('penyaInput');
  const rateHint = document.getElementById('rateHint');

  function updateHint() {
    rateHint.textContent = `1 FCoin <-> ${formatNumber(rate / 1000)} Penya`;
  }
  updateHint();

  rateInput.addEventListener('input', async () => {
    rate = parseNumber(rateInput.value) || 1;
    updateHint();
    if (fcoin > 0) {
      penya = (fcoin * rate) / 1000;
      penyaInput.value = formatNumber(penya);
    }
    await window.utilityAPI.setData('fcoin', { rate });
  });

  fcoinInput.addEventListener('input', () => {
    fcoin = parseNumber(fcoinInput.value);
    penya = (fcoin * rate) / 1000;
    penyaInput.value = formatNumber(penya);
  });

  penyaInput.addEventListener('input', () => {
    penya = parseNumber(penyaInput.value);
    fcoin = rate > 0 ? (penya * 1000) / rate : 0;
    fcoinInput.value = formatNumber(fcoin);
  });
}

function renderChecklist(items, onToggle, onRemove) {
  const list = document.createElement('ul');
  list.className = 'widget-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = item.done ? 'done' : '';
    li.innerHTML = `<input type="checkbox" ${item.done ? 'checked' : ''} /><span></span><button title="Remove">&times;</button>`;
    li.querySelector('span').textContent = item.text;
    li.querySelector('input').addEventListener('change', () => onToggle(item.id));
    li.querySelector('button').addEventListener('click', () => onRemove(item.id));
    list.appendChild(li);
  }
  return list;
}

async function initChecklist(storageType) {
  const data = (await window.utilityAPI.getData(storageType)) || { items: [] };
  let items = data.items || [];

  body.innerHTML = `
    <div class="widget-add-row">
      <input id="addInput" type="text" placeholder="Add an item..." />
      <button id="addBtn" class="primary-btn">Add</button>
    </div>
    <div id="listContainer" style="flex:1; min-height:0; display:flex;"></div>
  `;

  const listContainer = document.getElementById('listContainer');

  async function persist() {
    await window.utilityAPI.setData(storageType, { items });
  }

  function render() {
    listContainer.innerHTML = '';
    listContainer.appendChild(
      renderChecklist(
        items,
        async (id) => {
          items = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
          await persist();
          render();
        },
        async (id) => {
          items = items.filter((i) => i.id !== id);
          await persist();
          render();
        }
      )
    );
  }
  render();

  const addInput = document.getElementById('addInput');
  async function addItem() {
    const text = addInput.value.trim();
    if (!text) return;
    items.push({ id: crypto.randomUUID(), text, done: false });
    addInput.value = '';
    await persist();
    render();
  }
  document.getElementById('addBtn').addEventListener('click', addItem);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });
}

async function initNotepad() {
  const data = (await window.utilityAPI.getData('notepad')) || { content: '' };
  body.innerHTML = `<textarea id="notepadArea" class="widget-notepad-textarea" placeholder="Type your notes here...">${data.content || ''}</textarea>`;

  const area = document.getElementById('notepadArea');
  let saveTimer = null;
  area.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.utilityAPI.setData('notepad', { content: area.value });
    }, 400);
  });
}

if (type === 'fcoin') initFcoin();
else if (type === 'questlog') initQuestLog();
else if (type === 'todo') initChecklist('todo');
else if (type === 'notepad') initNotepad();

async function initQuestLog() {
  const stored = (await window.utilityAPI.getData('questlog')) || {};
  const accounts = await window.utilityAPI.listAccounts();
  const state = {
    characters: Array.isArray(stored.characters) ? stored.characters : [],
    activeCharacterId: stored.activeCharacterId || null,
    sidebarSide: stored.sidebarSide || 'right',
    recommendationFilters: { Mandatory: true, Prioritize: true, 'On the go': true, Wait: true, Skip: false, Special: false, ...(stored.recommendationFilters || {}) },
    levelAppropriateOnly: Boolean(stored.levelAppropriateOnly),
    fwcFilterEnabled: Boolean(stored.fwcFilterEnabled),
    collapsed: stored.collapsed || {},
    showCompleted: stored.showCompleted || {},
    showHidden: stored.showHidden || {},
  };
  const classes = ['Mercenary', 'Assist', 'Magician', 'Acrobat'];
  const categories = ['Mandatory', 'Prioritize', 'On the go', 'Wait', 'Skip', 'Special'];
  const fwcLines = new Set(['1st Job Change', '2nd Job Change', '3rd Job Change', 'The Clockworks War', 'Azria', 'Volkane Dungeon', 'Storm Peak', 'Coral Island', 'The Wilds', 'Herneos', 'The Kaillun Expedition']);
  const fwcOffice = new Set(['Anesthetic Needs', 'Mushroom Farm of Chitller', 'The Best Shield', 'Strange Collector (6)', 'Evil Eyed Red Dragon', 'Request of Lurif', 'Prehistoric Birds (2)']);
  const save = () => window.utilityAPI.setData('questlog', state);
  const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const active = () => state.characters.find((character) => character.id === state.activeCharacterId);
  const key = (quest) => `${quest.name}${quest.level}`;
  const label = (recommendation) => recommendation.toLowerCase() === 'on the go' ? 'On the Go' : recommendation;
  const badgeClass = (recommendation) => `quest-badge quest-${recommendation.toLowerCase().replace(/\s+/g, '-')}`;
  const isFwc = (quest) => quest.questline !== 'Hero' && (fwcLines.has(quest.questline) || (quest.questline === 'Office' && (quest.level >= 115 || fwcOffice.has(quest.name))));

  function addCharacter() {
    const overlay = document.createElement('div');
    overlay.className = 'quest-dialog-backdrop';
    overlay.innerHTML = `<form class="quest-dialog"><h3>Add Character</h3><p>Create a character from a saved account or enter one manually.</p><label>Account (optional)<select id="questAccount"><option value="">Select Account</option>${accounts.map((account) => `<option value="${account.id}"></option>`).join('')}</select></label><label>Character name<input id="questCharacterName" type="text" placeholder="Name" required></label><label>Class<select id="questCharacterClass" required><option value="">Select Class</option>${classes.map((flyffClass) => `<option value="${flyffClass}">${flyffClass}</option>`).join('')}</select></label><div class="quest-dialog-actions"><button type="button" id="questCancel" class="secondary-btn">Cancel</button><button type="submit" class="primary-btn">Create Character</button></div></form>`;
    const accountSelect = overlay.querySelector('#questAccount');
    accounts.forEach((account, index) => { accountSelect.options[index + 1].textContent = account.name; });
    const nameInput = overlay.querySelector('#questCharacterName');
    accountSelect.onchange = () => { const account = accounts.find((entry) => entry.id === accountSelect.value); if (account) nameInput.value = account.name; };
    overlay.querySelector('#questCancel').onclick = () => overlay.remove();
    overlay.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const flyffClass = overlay.querySelector('#questCharacterClass').value;
      if (!name || !classes.includes(flyffClass)) return;
      const account = accounts.find((entry) => entry.id === accountSelect.value);
      const character = { id: id(), name, icon: account?.icon || null, flyffClass, level: null, completedQuests: [], hiddenQuests: [], expandedQuestlines: [] };
      state.characters.push(character);
      state.activeCharacterId = character.id;
      save(); overlay.remove(); render();
    };
    body.appendChild(overlay);
    nameInput.focus();
  }

  function render() {
    const character = active();
    body.innerHTML = `<div class="questlog-app"><div class="quest-header"><strong>Quest Log</strong><div><button id="questSettings" class="icon-btn" title="Settings">&#9881;</button><button id="questClose" class="icon-btn" title="Close">&#10005;</button></div></div><div class="quest-tabs" id="questTabs"></div><div id="questSettingsPanel" class="quest-settings hidden"></div><div class="quest-controls"><label>Lv. <button id="levelDown">-</button><input id="questLevel" type="number" min="1" max="300" placeholder="--" value="${character?.level || ''}"><button id="levelUp">+</button></label><input id="questSearch" type="search" placeholder="Search Quests..."></div><div id="questList" class="quest-list"></div></div>`;
    const tabs = document.getElementById('questTabs');
    state.characters.forEach((entry) => { const button = document.createElement('button'); button.className = entry.id === state.activeCharacterId ? 'active' : ''; button.textContent = entry.name; button.title = 'Right-click to rename or delete'; button.onclick = () => { state.activeCharacterId = entry.id; save(); render(); }; button.oncontextmenu = (event) => { event.preventDefault(); const action = prompt('Type rename or delete:'); if (action === 'rename') { const next = prompt('New name:', entry.name); if (next?.trim()) entry.name = next.trim(); } else if (action === 'delete') { state.characters = state.characters.filter((item) => item.id !== entry.id); state.activeCharacterId = state.characters[0]?.id || null; } save(); render(); }; tabs.appendChild(button); });
    const add = document.createElement('button'); add.className = 'add-character'; add.textContent = '+'; add.title = 'Add Character'; add.onclick = addCharacter; tabs.appendChild(add);
    document.getElementById('questClose').onclick = () => window.utilityAPI.closeWindow();
    document.getElementById('questSettings').onclick = () => { const panel = document.getElementById('questSettingsPanel'); panel.classList.toggle('hidden'); panel.innerHTML = `<strong>Show Recommendations</strong>${categories.map((category) => `<label><input type="checkbox" data-category="${category}" ${state.recommendationFilters[category] ? 'checked' : ''}> ${label(category)}</label>`).join('')}<label><input id="fwcFilter" type="checkbox" ${state.fwcFilterEnabled ? 'checked' : ''}> FWC Quest Filter</label><label><input id="levelFilter" type="checkbox" ${state.levelAppropriateOnly ? 'checked' : ''}> Level Appropriate Only (&plusmn; 5 Lv.)</label>`; panel.querySelectorAll('[data-category]').forEach((input) => input.onchange = () => { state.recommendationFilters[input.dataset.category] = input.checked; save(); render(); }); panel.querySelector('#fwcFilter').onchange = (event) => { state.fwcFilterEnabled = event.target.checked; save(); render(); }; panel.querySelector('#levelFilter').onchange = (event) => { state.levelAppropriateOnly = event.target.checked; save(); render(); }; };
    const updateLevel = (value) => { if (!character) return; character.level = value ? Math.max(1, Math.min(300, Number(value))) : null; save(); render(); };
    document.getElementById('questLevel').onchange = (event) => updateLevel(event.target.value); document.getElementById('levelDown').onclick = () => updateLevel((character?.level || 1) - 1); document.getElementById('levelUp').onclick = () => updateLevel((character?.level || 0) + 1);
    document.getElementById('questSearch').oninput = (event) => renderList(event.target.value);
    renderList('');
  }

  function renderList(search) {
    const container = document.getElementById('questList'); if (!container) return; const character = active();
    if (!character) { container.innerHTML = '<div class="quest-empty">No Characters Configured<br><small>Press + to add a character.</small></div>'; return; }
    let filtered = window.questData.quests.filter((quest) => !character.level || (state.levelAppropriateOnly ? Math.abs(quest.level - character.level) <= 5 : quest.level <= character.level));
    if (state.fwcFilterEnabled) filtered = filtered.filter(isFwc);
    filtered = filtered.filter((quest) => state.recommendationFilters[categories.find((category) => quest.recommendation.toLowerCase().includes(category.toLowerCase())) || quest.recommendation] !== false);
    const term = search.trim().toLowerCase(); if (term) filtered = filtered.filter((quest) => `${quest.name} ${quest.questline} ${quest.monstersToHunt}`.toLowerCase().includes(term));
    const groups = new Map(); filtered.forEach((quest) => { if (!groups.has(quest.questline)) groups.set(quest.questline, []); groups.get(quest.questline).push(quest); }); container.innerHTML = '';
    groups.forEach((questsInLine, questline) => { const group = document.createElement('section'); const collapsed = state.collapsed[questline] !== false; group.innerHTML = `<button class="questline-header"><span>${collapsed ? '&#9654;' : '&#9660;'}</span><strong></strong><small>${questsInLine.length}</small></button><div class="questline-body ${collapsed ? 'hidden' : ''}"></div>`; group.querySelector('strong').textContent = questline; group.querySelector('.questline-header').onclick = () => { state.collapsed[questline] = !collapsed; save(); renderList(search); }; const list = group.querySelector('.questline-body'); questsInLine.forEach((quest) => { const questKey = key(quest); const completed = character.completedQuests.includes(questKey); const hidden = questline === 'Office' && character.hiddenQuests.includes(questKey); if (!completed && !hidden || completed || hidden) { const row = document.createElement('div'); row.className = `quest-row ${completed ? 'completed' : ''} ${hidden ? 'hidden-quest' : ''}`; row.innerHTML = `<div class="quest-info"><span class="quest-level">${quest.level}</span><a target="_blank" rel="noopener noreferrer"></a><div><span class="${badgeClass(quest.recommendation)}"></span> <span class="quest-exp"></span></div>${quest.monstersToHunt ? `<small>${quest.monstersToHunt.replace(/\n/g, ', ')}</small>` : ''}${quest.itemsNeeded ? `<small>Items: ${quest.itemsNeeded.replace(/\n/g, ', ')}</small>` : ''}</div><div class="quest-actions"><button class="complete" title="Mark complete">${completed ? '&#10003;' : ''}</button>${questline === 'Office' ? `<button class="hide-quest" title="Hide quest">${hidden ? '&#128065;' : '&#128064;'}</button>` : ''}</div>`; row.querySelector('a').textContent = quest.name; row.querySelector('a').href = quest.url; row.querySelector('.quest-badge').textContent = label(quest.recommendation); row.querySelector('.quest-exp').textContent = quest.experience !== '-' ? quest.experience : ''; row.querySelector('.complete').onclick = () => { character.completedQuests = completed ? character.completedQuests.filter((item) => item !== questKey) : [...character.completedQuests, questKey]; save(); renderList(search); }; row.querySelector('.hide-quest')?.addEventListener('click', () => { character.hiddenQuests = hidden ? character.hiddenQuests.filter((item) => item !== questKey) : [...character.hiddenQuests, questKey]; save(); renderList(search); }); list.appendChild(row); } }); group.querySelector('.questline-body').append(...list.childNodes); container.appendChild(group); });
  }
  render();
}
