// Second-level crawl: opens each control of one tab, then presses every control on the screen it opens (fresh load each time).
// usage: node scripts/crawl2.mjs <tab> [url] [maxFirst] [maxSecond]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const tab = process.argv[2] || 'Settings';
const url = process.argv[3] || 'http://localhost:4173/';
const maxFirst = Number(process.argv[4] || 30), maxSecond = Number(process.argv[5] || 10);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, permissions: ['geolocation', 'microphone'] });
const page = await ctx.newPage();
let errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack || e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 250)); });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const boot = async () => { await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1000);
  if (await page.getByText('Skip', { exact: true }).count()) { await page.getByText('Skip', { exact: true }).first().click(); await page.waitForTimeout(600); }
  if (await page.getByText('Skip for Now', { exact: true }).count()) { await page.getByText('Skip for Now', { exact: true }).first().click(); await page.waitForTimeout(1000); }
  await page.getByText(tab, { exact: true }).last().click({ timeout: 3000 }); await page.waitForTimeout(600); };
const labels = async () => page.evaluate(() => { const out = []; const seen = new Set();
  for (const e of document.querySelectorAll('*')) {
    if (getComputedStyle(e).cursor !== 'pointer') continue; const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue;
    const t = (e.innerText || e.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 40); const k = t + '@' + Math.round(r.top / 20); if (t && /[A-Za-z]{3}/.test(t) && !seen.has(k)) { seen.add(k); out.push(t); } } return out; });
const crashed = async () => (await page.getByText('Something went wrong').count()) > 0;
const tabs = ['Home', 'Chats', 'Workspace', 'Language', 'Settings'];
await boot();
const first = (await labels()).filter((l) => !tabs.includes(l)).slice(0, maxFirst);
const report = [];
for (const l of first) {
  await boot(); errs = [];
  try { await page.getByText(l, { exact: true }).first().click({ timeout: 2500 }); await page.waitForTimeout(1200); } catch { continue; }
  if (await crashed() || errs.length) { report.push(`${tab} > "${l}": ${await crashed() ? 'CRASH ' : ''}${errs.slice(0, 2).join(' | ')}`); continue; }
  const second = (await labels()).filter((x) => !tabs.includes(x) && x !== l).slice(0, maxSecond);
  console.log(`-- ${l}: ${second.length} controls`);
  for (const s of second) {
    await boot(); errs = [];
    try { await page.getByText(l, { exact: true }).first().click({ timeout: 2500 }); await page.waitForTimeout(900); errs = []; await page.getByText(s, { exact: true }).first().click({ timeout: 2000 }); await page.waitForTimeout(900); } catch { continue; }
    if (await crashed() || errs.length) { report.push(`${tab} > "${l}" > "${s}": ${await crashed() ? 'CRASH ' : ''}${errs.slice(0, 2).join(' | ')}`); if (await crashed()) await page.screenshot({ path: `/tmp/crash2-${tab}-${l.replace(/\W/g, '_')}-${s.replace(/\W/g, '_')}.png` }); }
  }
}
console.log(report.length ? 'PROBLEMS:\n' + report.join('\n') : 'NO PROBLEMS FOUND');
await browser.close();
