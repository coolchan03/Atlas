/// <reference lib="webworker" />
// Atlas service worker: precaches the whole app shell so the app opens with no network, then serves
// everything from the cache first. Model files and library packs are NOT cached here: they live in the
// origin private file system (downloaded by the app itself).
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, addPlugins } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Cross-origin isolation (needed for multi-threaded WASM / SharedArrayBuffer): static hosts such as GitHub Pages
// cannot send COOP/COEP headers, so the service worker adds them to every response it serves from its caches.
const isolate = (res: Response): Response => {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};
const isolationPlugin = { cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => (cachedResponse ? isolate(cachedResponse) : cachedResponse) };
addPlugins([isolationPlugin]);

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Single page app: any navigation answers with the cached shell (works offline, deep links work).
const scope = new URL(self.registration.scope).pathname;
registerRoute(new NavigationRoute(createHandlerBoundToURL(scope + 'index.html'), { denylist: [/android-assets\//, /\/__/] }));

// Bundled assets copied from the Android app (embedding model etc): cache on first use, keep for a year.
registerRoute(
  ({ url }) => url.pathname.includes('/android-assets/'),
  new CacheFirst({ cacheName: 'atlas-bundled-assets', plugins: [isolationPlugin, new ExpirationPlugin({ maxAgeSeconds: 365 * 86400, maxEntries: 40 })] }),
);

// WASM engines and fonts loaded from other origins (CDN fallbacks) are refreshed in the background.
registerRoute(
  ({ request, url }) => url.origin !== self.location.origin && ['script', 'font', 'style'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'atlas-third-party' }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Notification click opens or focuses the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const c = cs[0];
      return c ? c.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
