// Boots the built web app in headless Chromium, prints console errors, saves a screenshot.
// usage: node scripts/smoke.mjs [url] [out.png]   (run `npm run preview` first, or pass a dev-server url)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

const url = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || '/tmp/atlas-web.png';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e.stack || e).slice(0, 800)}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.env.WAIT || 6000));
await page.screenshot({ path: out });
console.log('title:', await page.title());
console.log('text:', (await page.evaluate(() => document.body.innerText)).slice(0, 600).replace(/\n+/g, ' | '));
console.log(errors.length ? errors.slice(0, 25).join('\n') : 'no console errors');
await browser.close();
