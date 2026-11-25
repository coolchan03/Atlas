// Opens a real Mapsforge map (Monaco, from download.mapsforge.org) in the Maps screen, checks drawing, place search.
// usage: node scripts/map-test.mjs [url] [map file]   (default map: /tmp/monaco.map)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
import fs from 'node:fs';
const mapFile = process.argv[3] || '/tmp/monaco.map';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, permissions: ['geolocation'], geolocation: { latitude: 43.7384, longitude: 7.4246 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) console.error('[c]', m.text().slice(0, 200)); });
await p.goto((process.argv[2] || 'http://localhost:4173/'), { waitUntil: 'load' }); await p.waitForFunction(() => window.__atlas);
await p.evaluate(async (b64) => { const a = window.__atlas; await a.rnfs.writeFile('/atlas/files/maps/monaco.map', b64, 'base64');
  localStorage.setItem('atlas-maps', JSON.stringify({ state: { current: '/atlas/files/maps/monaco.map', external: [], imperial: false, waypoints: [{ id: '1', name: 'Casino', lat: 43.7396, lon: 7.4276, createdAt: 1 }], lastFix: null }, version: 0 })); }, fs.readFileSync(mapFile).toString('base64'));
const probe = await p.evaluate(async () => { const D = window.__atlas.NativeModules.AtlasDevice; return { info: await D.mapInfo('/atlas/files/maps/monaco.map'), near: (await D.mapPlaces('/atlas/files/maps/monaco.map', 43.7384, 7.4246, 1500, 'restaurant', 3)).map((x) => x.name + ' ' + Math.round(x.distanceM) + 'm'), hosp: (await D.mapPlaces('/atlas/files/maps/monaco.map', 43.7384, 7.4246, 3000, 'hospital', 3)).map((x) => x.name + ' ' + x.kind) }; });
console.log(JSON.stringify(probe));
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500);
await p.getByText('Skip', { exact: true }).first().click(); await p.waitForTimeout(600);
await p.getByText('Skip for Now', { exact: true }).first().click(); await p.waitForTimeout(1500);
await p.getByText('Search', { exact: true }).first().click(); await p.waitForTimeout(1200);
await p.keyboard.type('Maps'); await p.waitForTimeout(1000);
await p.screenshot({ path: '/tmp/map0.png' });
await p.getByText('Maps', { exact: true }).first().click({ timeout: 4000 }).catch((e) => console.error('click maps failed'));
await p.waitForTimeout(4000);
await p.screenshot({ path: '/tmp/map1.png' });
await p.getByText('Center on me', { exact: true }).first().click().catch(() => console.error('center failed'));
await p.waitForTimeout(3500);
await p.screenshot({ path: process.env.MAP_SHOT || '/tmp/map2.png' });
const ok = probe.near.length > 0 && probe.hosp.length > 0 && probe.info.minLat < 43.5;
console.log(ok ? 'MAP TEST PASSED' : 'MAP TEST FAILED');
process.exitCode = ok ? 0 : 1;

await b.close();
