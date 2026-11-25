// A small DOM banner (outside React, so it works before / without the app tree): "Install Atlas" when the
// browser offers installation, and "Update ready" when a new version has been downloaded in the background.
import { subscribePwa, promptInstall, applyUpdate } from './register';

const FONT = "Menlo, Consolas, 'Courier New', monospace";
let el: HTMLDivElement | null = null;
const DISMISS = 'atlas.pwa.dismissed';

function show(text: string, action: string, onAction: () => void) {
  hide();
  el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = `position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147482000;max-width:460px;margin:0 auto;display:flex;gap:10px;align-items:center;justify-content:space-between;background:#141414;color:#EDEDED;border:1px solid #2c2c2c;border-radius:8px;padding:10px 12px;font:13px ${FONT};box-shadow:0 6px 24px rgba(0,0,0,.45)`;
  const t = document.createElement('span');
  t.textContent = text;
  const row = document.createElement('span');
  row.style.cssText = 'display:flex;gap:8px;flex-shrink:0';
  const mk = (label: string, color: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:13px ${FONT};padding:6px 10px;border-radius:6px;border:1px solid #2c2c2c;background:#0A0A0A;color:${color};cursor:pointer`;
    b.onclick = fn;
    return b;
  };
  row.appendChild(mk(action, '#34d399', onAction));
  row.appendChild(mk('Later', '#9a9a9a', () => { try { sessionStorage.setItem(DISMISS, '1'); } catch { /* ok */ } hide(); }));
  el.append(t, row);
  document.body.appendChild(el);
}
function hide() { el?.remove(); el = null; }

export function startBanner() {
  if ((globalThis as any).atlasHost) return; // the Windows app updates itself
  subscribePwa((s) => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS) === '1'; } catch { /* ok */ }
    if (s.updateReady) show('A new version of Atlas is ready.', 'Update', applyUpdate);
    else if (s.canInstall && !s.installed && !dismissed) show('Install Atlas to use it offline, like an app.', 'Install', () => { void promptInstall().then(hide); });
    else hide();
  });
}
