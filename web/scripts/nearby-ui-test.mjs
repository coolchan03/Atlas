// The Settings > Offline device sync section with a stand-in host bridge: it shows up, turns on, and draws the pairing QR code.
// usage: node scripts/nearby-ui-test.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 860 } });
await ctx.addInitScript(() => {
  const id = 'ab12cd34ef56ab12cd34ef56ab12cd34';
  window.atlasHost = { nearby: {
    available: true, onMessage() {}, start: async () => ({ deviceId: id, port: 47839, address: '192.168.1.5' }), stop: async () => true,
    invitation: async () => `atlas://sync?id=${id}&ip=192.168.1.5&port=47839&key=${'A'.repeat(43)}`,
    pair: async () => ({}), sync: async () => ({}), respond: async () => true, peers: async () => [], unpair: async () => true,
  } };
});
const errors = [];
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await p.goto(process.argv[2] || 'http://localhost:4173/', { waitUntil: 'load' });
await p.waitForTimeout(1500);
if (await p.getByText('Skip', { exact: true }).count()) { await p.getByText('Skip', { exact: true }).first().click(); await p.waitForTimeout(800); }
if (await p.getByText('Skip for Now', { exact: true }).count()) { await p.getByText('Skip for Now', { exact: true }).first().click(); await p.waitForTimeout(1200); }
await p.getByText('Settings', { exact: true }).first().click();
await p.waitForTimeout(1200);
// Settings > Backup & sync holds the section (further down the list)
let opened = false;
for (let i = 0; i < 30 && !opened; i++) {
  opened = (await p.getByText('Backup & sync', { exact: true }).count()) > 0;
  if (!opened) await p.mouse.wheel(0, 500).then(() => p.waitForTimeout(200));
}
if (opened) { await p.getByText('Backup & sync', { exact: true }).first().click(); await p.waitForTimeout(1200); }
let found = false;
for (let i = 0; i < 25 && !found; i++) {
  found = (await p.getByText('Offline device sync').count()) > 0;
  if (!found) await p.mouse.wheel(0, 500).then(() => p.waitForTimeout(200));
}
console.log('section visible:', found);
let toggled = false, qr = false;
if (found) {
  await p.locator('[data-testid="nearby-sync-toggle"]').first().click({ force: true });
  await p.waitForTimeout(1200);
  toggled = (await p.getByText('Show pairing QR code').count()) > 0;
  if (toggled) {
    await p.getByText('Show pairing QR code').first().click();
    await p.waitForTimeout(1500);
    qr = (await p.getByText(/Valid for 10 minutes/).count()) > 0;
  }
}
await p.screenshot({ path: process.env.NEARBY_SHOT || '/tmp/nearby.png' });
console.log(JSON.stringify({ found, toggled, qr, errors }));
const ok = found && toggled && qr && !errors.length;
console.log(ok ? 'NEARBY UI TEST PASSED' : 'NEARBY UI TEST FAILED');
process.exitCode = ok ? 0 : 1;
await b.close();
