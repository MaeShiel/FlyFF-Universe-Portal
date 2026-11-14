// Preload for the game views (one per account tab). Its only job is split view's
// "focus follows mouse": tell the main process when the pointer is moving over this game, so
// it can give this view keyboard focus and key presses reach the character under the cursor
// without a click. The main process ignores the message unless the window is in split view and
// this view is not already focused. Nothing is exposed to the page itself.
const { ipcRenderer } = require('electron');

const HOVER_THROTTLE_MS = 200;
let lastSent = 0;

function reportHover(event) {
  // Ignore drags that started elsewhere (e.g. rotating the camera past the tile edge).
  if (event.buttons !== 0) return;
  const now = Date.now();
  if (now - lastSent < HOVER_THROTTLE_MS) return;
  lastSent = now;
  ipcRenderer.send('game:hover');
}

window.addEventListener('mousemove', reportHover, { capture: true, passive: true });
// Report again right away the next time the pointer comes back in.
window.addEventListener('mouseout', (event) => {
  if (!event.relatedTarget) lastSent = 0;
}, { capture: true, passive: true });
