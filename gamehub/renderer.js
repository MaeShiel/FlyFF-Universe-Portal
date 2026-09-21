const tabStrip = document.getElementById('tabStrip');

document.getElementById('minimizeBtn').addEventListener('click', () => window.hubAPI.minimize());
document.getElementById('maximizeBtn').addEventListener('click', () => window.hubAPI.toggleMaximize());
document.getElementById('closeBtn').addEventListener('click', () => window.hubAPI.close());

let tabs = [];
let activeAccountId = null;

const TEAR_OUT_THRESHOLD = 36;
const REORDER_THRESHOLD = 6;

function render() {
  tabStrip.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'hub-tab' + (tab.accountId === activeAccountId ? ' active' : '');
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
  render();
});

