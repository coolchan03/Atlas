// Crawls the built app: opens every bottom tab, presses every visible button once (fresh load each time) and
// reports crashes (error boundary, uncaught errors). usage: node scripts/crawl.mjs [url] [maxPerTab]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.argv[2] || 'http://localhost:4173/';
const max = Number(process.argv[3] || 30);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
await ctx.grantPermissions(['geolocation', 'microphone'], { origin: new URL(url).origin }).catch(() => {});
const page = await ctx.newPage();
let errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack || e).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const boot = async () => { errs = []; await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  if (await page.getByText('Skip', { exact: true }).count()) { await page.getByText('Skip', { exact: true }).first().click(); await page.waitForTimeout(800); }
  if (await page.getByText('Skip for Now', { exact: true }).count()) { await page.getByText('Skip for Now', { exact: true }).first().click(); await page.waitForTimeout(1200); } };
const labels = async () => page.evaluate(() => {
  const out = []; const seen = new Set();
  for (const e of document.querySelectorAll('[tabindex="0"],[role=button],[role=tab],[role=switch],a')) {
    const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue;
    const t = (e.innerText || e.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 40); const k = t + '@' + Math.round(r.top / 20);
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  } return out; });
const crashed = async () => (await page.getByText('Something went wrong').count()) > 0;
await boot();
const tabs = ['Home', 'Chats', 'Workspace', 'Language', 'Settings'];
const report = [];
for (const tab of tabs) {
  await boot();
  try { await page.getByText(tab, { exact: true }).last().click({ timeout: 3000 }); } catch { report.push(`TAB ${tab}: could not open`); continue; }
  await page.waitForTimeout(1200);
  const base = await crashed(); if (base || errs.length) report.push(`TAB ${tab}: ${base ? 'CRASH ' : ''}${errs.slice(0, 2).join(' | ')}`);
  const ls = (await labels()).filter((l) => !tabs.includes(l)).slice(0, max);
  console.log(`== ${tab}: ${ls.length} controls`);
  for (const [i, l] of ls.entries()) {
    await boot();
    try { await page.getByText(tab, { exact: true }).last().click({ timeout: 3000 }); await page.waitForTimeout(700);
      errs = []; await page.getByText(l, { exact: true }).first().click({ timeout: 2500 }); await page.waitForTimeout(800); } catch { continue; }
    const bad = await crashed();
    if (bad || errs.length) { report.push(`${tab} > "${l}": ${bad ? 'CRASH ' : ''}${errs.slice(0, 2).join(' | ')}`); if (bad) await page.screenshot({ path: `/tmp/crash-${tab}-${i}.png` }); }
  }
}
console.log(report.length ? 'PROBLEMS:\n' + report.join('\n') : 'NO PROBLEMS FOUND');
await browser.close();
