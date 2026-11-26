// When the app's code cannot load, the page says so (with a way out) instead of staying on the word "Atlas".
// usage: node scripts/fatal-test.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
let seen = 0;
// let the first script (the entry) load, then make every later app chunk fail
await p.route(/\/assets\/index-[^/]*\.js$/, (r) => (seen++ === 0 ? r.continue() : r.abort()));
await p.goto(process.argv[2] || 'http://localhost:4173/', { waitUntil: 'load' });
await p.waitForSelector('#fatal-reload', { timeout: 15000 }).catch(() => undefined);
const text = await p.evaluate(() => document.body.innerText.slice(0, 200));
const ok = /could not start/.test(text) && (await p.locator('#fatal-reset').count()) === 1;
console.log(JSON.stringify(text));
console.log(ok ? 'FATAL SCREEN TEST PASSED' : 'FATAL SCREEN TEST FAILED');
process.exitCode = ok ? 0 : 1;
await b.close();
