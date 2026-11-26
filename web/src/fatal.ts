// If Atlas cannot start, the page must say why instead of staying on the word "Atlas". Shown in place of the splash, with a way
// out: reload, or clear this site's cached copy (a stale offline copy is the usual cause after an update) and load it again.
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

export function showFatal(error: unknown): void {
  const boot = document.getElementById('boot');
  if (!boot) return; // the app is already on screen: later errors are the app's own business
  const err = error as { message?: string; stack?: string } | undefined;
  const detail = String(err?.stack || err?.message || error).split('\n').slice(0, 6).join('\n');
  boot.style.cssText += ';flex-direction:column;gap:12px;padding:24px;text-align:center;white-space:pre-wrap';
  boot.innerHTML = `<div style="color:#e5e5e5;font-size:15px">Atlas could not start</div><div style="max-width:560px;opacity:.8;word-break:break-word">${esc(detail)}</div>`
    + '<div style="display:flex;gap:12px"><button id="fatal-reload">Reload</button><button id="fatal-reset">Clear cached copy and reload</button></div>';
  document.getElementById('fatal-reload')?.addEventListener('click', () => location.reload());
  document.getElementById('fatal-reset')?.addEventListener('click', async () => {
    try { for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister(); } catch { /* none */ }
    try { for (const k of (await caches?.keys()) ?? []) await caches.delete(k); } catch { /* none */ }
    location.reload(); // saved chats and models are not touched: only the downloaded copy of the app
  });
}

/** Errors thrown before the app is on screen (a failed script, a rejected promise) are shown too; a hang is reported after 25 seconds. */
export function watchStartup(): void {
  window.addEventListener('error', (e) => showFatal(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));
  setTimeout(() => showFatal(new Error('Starting is taking much longer than usual. Reload, or clear the cached copy if it keeps happening.')), 25000);
}
