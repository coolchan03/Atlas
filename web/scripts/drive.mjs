// Ad hoc driver: node scripts/drive.mjs "click:Skip" "wait:1500" "shot:/tmp/a.png" "text" ...
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const url = process.env.URL || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--no-sandbox', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])] });
const ctx = await browser.newContext({ permissions: ['microphone'], viewport: { width: Number(process.env.W || 412), height: Number(process.env.H || 860) } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (["error","log","warning"].includes(m.type())) errors.push(`[error] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e.stack || e).slice(0, 600)}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);
for (const step of process.argv.slice(2)) {
  const [cmd, ...rest] = step.split(':'); const arg = rest.join(':');
  try {
    if (cmd === 'click') await page.getByText(arg, { exact: true }).first().click({ timeout: 4000 });
    else if (cmd === 'clickt') await page.getByText(arg).first().click({ timeout: 4000 });
    else if (cmd === 'fill') { const [ph, ...t] = arg.split('|'); await page.getByPlaceholder(ph).first().fill(t.join('|')); }
    else if (cmd === 'xy') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); }
    else if (cmd === 'press') await page.keyboard.press(arg)
    else if (cmd === 'choose') page.once('filechooser', (fc) => fc.setFiles(arg))
    else if (cmd === 'wait') await page.waitForTimeout(Number(arg));
    else if (cmd === 'shot') await page.screenshot({ path: arg });
    else if (cmd === 'type') await page.keyboard.type(arg);
    else if (cmd === 'text') console.log('TEXT:', (await page.evaluate(() => document.body.innerText)).slice(0, 900).replace(/\n+/g, ' | '));
    else if (cmd === 'eval') console.log('EVAL:', JSON.stringify(await page.evaluate(arg)));
  } catch (e) { console.log('STEP FAILED', step, String(e).split('\n')[0]); }
}
console.log(errors.length ? errors.slice(-400).join('\n') : 'no console errors');
await browser.close();
