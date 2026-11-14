const tabStrip = document.getElementById('tabStrip');

document.getElementById('minimizeBtn').addEventListener('click', () => window.hubAPI.minimize());
document.getElementById('maximizeBtn').addEventListener('click', () => window.hubAPI.toggleMaximize());
document.getElementById('closeBtn').addEventListener('click', () => window.hubAPI.close());

const splitBtn = document.getElementById('splitBtn');
splitBtn.addEventListener('click', () => window.hubAPI.toggleSplit());

let tabs = [];
let activeAccountId = null;
let splitIds = []; // tabs that are tiled side by side

const TEAR_OUT_THRESHOLD = 36;
const REORDER_THRESHOLD = 6;

function render() {
  tabStrip.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    const inSplit = splitIds.includes(tab.accountId);
    el.className = 'hub-tab' + (tab.accountId === activeAccountId ? ' active' : '') + (inSplit ? ' in-split' : '');
    if (inSplit) el.title = 'Shown side by side with the other split tabs';
    el.dataset.accountId = tab.accountId;

    const label = document.createElement('span');
    label.className = 'hub-tab-label';
    label.textContent = tab.name;
    el.appendChild(label);

    const closeBtnEl = document.createElement('button');
    closeBtnEl.className = 'hub-tab-close';
    closeBtnEl.textContent = '\u00d7';
    closeBtnEl.title = 'Close tab';
    closeBtnEl.addEventListener('click', (evt) => {
      evt.stopPropagation();
      window.hubAPI.closeTab(tab.accountId);
    });
    el.appendChild(closeBtnEl);

    el.addEventListener('mousedown', (evt) => onTabMouseDown(evt, tab.accountId, el));
    tabStrip.appendChild(el);
  }
}

function onTabMouseDown(evt, accountId, el) {
  if (evt.button !== 0) return;
  const startX = evt.clientX;
  const startY = evt.clientY;
  const startIndex = tabs.findIndex((t) => t.accountId === accountId);
  let moved = false;
  let tearOut = false;
  let targetIndex = startIndex;

  function onMouseMove(moveEvt) {
    const dx = moveEvt.clientX - startX;
    const dy = moveEvt.clientY - startY;
    if (!moved && (Math.abs(dx) > REORDER_THRESHOLD || Math.abs(dy) > REORDER_THRESHOLD)) {
      moved = true;
      el.classList.add('dragging');
    }
    if (!moved) return;

    const barRect = tabStrip.getBoundingClientRect();
    tearOut = moveEvt.clientY < barRect.top - TEAR_OUT_THRESHOLD || moveEvt.clientY > barRect.bottom + TEAR_OUT_THRESHOLD;
    el.classList.toggle('tearing', tearOut);

    if (!tearOut) {
      const others = [...tabStrip.children].filter((child) => child !== el);
      let nextIndex = tabs.length - 1;
      for (let i = 0; i < others.length; i++) {
        const rect = others[i].getBoundingClientRect();
        if (moveEvt.clientX < rect.left + rect.width / 2) {
          nextIndex = tabs.findIndex((t) => t.accountId === others[i].dataset.accountId);
          break;
        }
      }
      targetIndex = nextIndex;
    }
  }

  function onMouseUp(upEvt) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    el.classList.remove('dragging', 'tearing');

    if (!moved) {
      window.hubAPI.activateTab(accountId);
      return;
    }
    if (tearOut) {
      window.hubAPI.tearOutTab(accountId, upEvt.screenX, upEvt.screenY);
    } else if (targetIndex !== startIndex) {
      window.hubAPI.reorderTab(accountId, targetIndex);
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

window.hubAPI.onTabsUpdate((data) => {
  tabs = data.tabs;
  activeAccountId = data.activeAccountId;
  splitIds = data.splitIds || [];
  const hasSplit = splitIds.length >= 2;
  splitBtn.classList.toggle('active', hasSplit);
  splitBtn.setAttribute('aria-pressed', String(hasSplit));
  splitBtn.disabled = !hasSplit && tabs.length < 2;
  splitBtn.title = hasSplit
    ? 'Split view is on: hover a character to control it. Click to go back to plain tabs.'
    : 'Split view: show all tabs side by side';
  render();
});


// ---- Split view dividers ----
// In split view the game tiles leave thin gaps where this page shows through. The main process
// sends the gap rectangles; each becomes a handle that can be dragged to resize the tiles next
// to it (double-click to even them out again).
const splitDividersEl = document.getElementById('splitDividers');
let draggingDivider = null;

function renderDividers(dividers) {
  splitDividersEl.innerHTML = '';
  for (const d of dividers) {
    const el = document.createElement('div');
    el.className = `hub-divider hub-divider-${d.kind}`;
    const isDragged = draggingDivider && draggingDivider.kind === d.kind && draggingDivider.row === d.row && draggingDivider.index === d.index;
    el.classList.toggle('dragging', Boolean(isDragged));
    el.style.left = `${d.x}px`;
    el.style.top = `${d.y}px`;
    el.style.width = `${d.width}px`;
    el.style.height = `${d.height}px`;
    el.title = 'Drag to resize. Double-click to reset.';
    el.addEventListener('mousedown', (evt) => onDividerMouseDown(evt, d));
    el.addEventListener('dblclick', () => window.hubAPI.resetSplit());
    splitDividersEl.appendChild(el);
  }
}

function onDividerMouseDown(evt, divider) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  draggingDivider = { kind: divider.kind, row: divider.row, index: divider.index };
  document.body.classList.add(divider.kind === 'col' ? 'resizing-col' : 'resizing-row');
  let pending = null;
  let frame = 0;

  function flush() {
    frame = 0;
    if (pending === null) return;
    window.hubAPI.dragDivider({ ...draggingDivider, position: pending });
    pending = null;
  }

  function onMouseMove(moveEvt) {
    pending = divider.kind === 'col' ? moveEvt.clientX : moveEvt.clientY;
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (frame) cancelAnimationFrame(frame);
    flush();
    draggingDivider = null;
    document.body.classList.remove('resizing-col', 'resizing-row');
    splitDividersEl.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    window.hubAPI.dragDividerEnd();
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

window.hubAPI.onSplitDividers(renderDividers);
