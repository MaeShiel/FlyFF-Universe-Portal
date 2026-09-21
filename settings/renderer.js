const extensionsList = document.getElementById('extensionsList');
const keybindsList = document.getElementById('keybindsList');

document.getElementById('minimizeBtn').addEventListener('click', () => window.settingsAPI.minimize());
document.getElementById('maximizeBtn').addEventListener('click', () => window.settingsAPI.toggleMaximize());
document.getElementById('closeBtn').addEventListener('click', () => window.settingsAPI.closeWindow());
window.settingsAPI.onWindowState((state) => {
  document.getElementById('maximizeBtn').textContent = state.maximized ? '\u2750' : '\u25a1';
});

const tabButtons = document.querySelectorAll('.settings-tab');
const tabPanels = {
  keybinds: document.getElementById('panelKeybinds'),
  extensions: document.getElementById('panelExtensions'),
};

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    for (const [name, panel] of Object.entries(tabPanels)) {
      panel.classList.toggle('hidden', name !== target);
    }
  });
});

const KEYBIND_LABELS = {
  swapTab: 'Swap to Previous Tab',
  toggleFullscreen: 'Toggle Fullscreen',
  closeTab: 'Close Tab',
};

const KEYBIND_HINTS = {
  swapTab: 'Switches back and forth between the two most recently used tabs.',
  toggleFullscreen: 'Toggles fullscreen mode for the Game Hub window.',
  closeTab: 'Closes the active tab, like a normal browser tab.',
};

function formatCombo(combo) {
  if (!combo) return 'Unassigned';
  return combo
    .split('+')
    .map((part) => (part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' + ');
}

function comboFromKeyEvent(evt) {
  const parts = [];
  if (evt.ctrlKey || evt.metaKey) parts.push('ctrl');
  if (evt.altKey) parts.push('alt');
  if (evt.shiftKey) parts.push('shift');
  const key = evt.key.toLowerCase();
  if (!['control', 'alt', 'shift', 'meta'].includes(key)) parts.push(key);
  return parts.sort().join('+');
}

async function refreshKeybinds() {
  const keybinds = await window.settingsAPI.getKeybinds();
  keybindsList.innerHTML = '';
  for (const action of Object.keys(KEYBIND_LABELS)) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="keybind-label"></div>
        <span class="keybind-hint"></span>
      </div>
      <button class="secondary-btn keybind-record" data-action="${action}"></button>
    `;
    li.querySelector('.keybind-label').textContent = KEYBIND_LABELS[action];
    li.querySelector('.keybind-hint').textContent = KEYBIND_HINTS[action];
    const recordBtn = li.querySelector('.keybind-record');
    recordBtn.textContent = formatCombo(keybinds[action]);
    recordBtn.addEventListener('click', () => startRecording(recordBtn, action));
    keybindsList.appendChild(li);
  }
}

function startRecording(button, action) {
  button.textContent = 'Press a key...';
  button.classList.add('recording');

  const onKeyDown = async (evt) => {
    evt.preventDefault();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(evt.key)) return;
    const combo = comboFromKeyEvent(evt);
    document.removeEventListener('keydown', onKeyDown, true);
    button.classList.remove('recording');
    await window.settingsAPI.setKeybind(action, combo);
    button.textContent = formatCombo(combo);
  };

  document.addEventListener('keydown', onKeyDown, true);
}

document.getElementById('resetKeybindsBtn').addEventListener('click', async () => {
  await window.settingsAPI.resetKeybinds();
  refreshKeybinds();
});

async function refreshExtensions() {
  const extensions = await window.settingsAPI.listExtensions();
  extensionsList.innerHTML = '';
  for (const ext of extensions) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div></div>
        <span class="ext-path"></span>
      </div>
      <button class="danger-btn" data-action="remove">Remove</button>
    `;
    li.querySelector('div > div').textContent = ext.name;
    li.querySelector('.ext-path').textContent = ext.path;
    li.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      await window.settingsAPI.removeExtension(ext.id);
      refreshExtensions();
    });
    extensionsList.appendChild(li);
  }
}

document.getElementById('addExtensionBtn').addEventListener('click', async () => {
  const result = await window.settingsAPI.addExtension();
  if (result) refreshExtensions();
});

refreshExtensions();
refreshKeybinds();
