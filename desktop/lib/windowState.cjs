'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { screen } = require('electron');

module.exports = function windowState(dir, defaults = { width: 1280, height: 860 }) {
  const file = path.join(dir, 'window-state.json');
  let state = { ...defaults };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  // A saved position on a monitor that is gone would open off screen.
  if (state.x != null && state.y != null) {
    const ok = screen.getAllDisplays().some((d) => state.x >= d.bounds.x - 50 && state.y >= d.bounds.y - 50 && state.x < d.bounds.x + d.bounds.width && state.y < d.bounds.y + d.bounds.height);
    if (!ok) { delete state.x; delete state.y; }
  }
  const save = (win) => {
    try {
      if (win.isDestroyed()) return;
      const b = win.getNormalBounds();
      fs.writeFileSync(file, JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch { /* best effort */ }
  };
  return {
    state,
    track(win) {
      let t;
      const later = () => { clearTimeout(t); t = setTimeout(() => save(win), 400); };
      win.on('resize', later); win.on('move', later); win.on('close', () => save(win));
    },
  };
};
