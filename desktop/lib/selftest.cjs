'use strict';
// `ATLAS_SELFTEST=1 electron .` : loads the app, checks the host bridge and the disk file system from inside
// the page, saves a screenshot (ATLAS_SELFTEST_SHOT) and exits 0 / 1. Used by CI and by hand.
const fs = require('node:fs');

exports.run = (win, app) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message.slice(0, 300)); });
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      let result = {};
      try {
        result = await win.webContents.executeJavaScript(`(async () => {
          const h = window.atlasHost;
          const out = { host: !!h, kind: h && h.kind, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined', webgpu: !!navigator.gpu };
          try {
            const a = window.__atlas;
            await a.rnfs.writeFile('/atlas/files/selftest.txt', 'héllo disk');
            out.read = await a.rnfs.readFile('/atlas/files/selftest.txt');
            out.hash = (await a.rnfs.hash('/atlas/files/selftest.txt', 'sha256')).slice(0, 12);
            out.fsKind = a.fs().kind;
            const d = a.openDatabase('selftest' + Date.now());
            d.executeSync('create virtual table x using fts5(c)'); d.executeSync('insert into x values(?)', ['hello world']);
            out.fts = d.executeSync("select c from x where x match 'hello'").rows.length;
            out.llama = await h.llama.capabilities();
            out.system = await h.system();
          } catch (e) { out.error = String(e && e.stack || e); }
          out.text = document.body.innerText.slice(0, 80).replace(/\\n+/g, ' | ');
          return out;
        })()`);
      } catch (e) { result = { error: String(e) }; }
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.ATLAS_SELFTEST_SHOT || '/tmp/atlas-desktop.png', img.toPNG());
      } catch { /* optional */ }
      console.log('SELFTEST ' + JSON.stringify(result));
      if (errors.length) console.log('CONSOLE ERRORS ' + JSON.stringify(errors.slice(0, 8)));
      const ok = result.host && result.read === 'héllo disk' && result.fts === 1 && !result.error && /Skip|YOURS|Atlas/i.test(result.text || '');
      console.log(ok ? 'SELFTEST PASSED' : 'SELFTEST FAILED');
      app.exit(ok ? 0 : 1);
    }, 6000);
  });
};
