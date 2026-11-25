# Atlas web (PWA) and the shared host layer

The same React Native app (`../src`, `../App.tsx`) compiled for the browser with react-native-web and Vite. The Windows app
(`../desktop`) loads this same build inside Electron.

```
cd web
npm ci                # needs the root packages too:  (cd .. && npm ci --ignore-scripts)
npm run dev           # http://localhost:5173 (hot reload; the app logs to the console)
npm run build         # dist/  (a PWA: manifest + service worker)
npm run preview       # serve dist on :4173
npm run typecheck     # the web layer (src/shims, host, engines, native)
```

## How the port works

- **Aliases, not forks.** `vite.config.ts` replaces every native package with a web implementation in `src/shims/`
  (react-native-fs, async storage, keychain, reanimated, vector icons, llama.rn, whisper.rn, op-sqlite, ...). `react-native`
  itself resolves to `src/shims/react-native.ts` (Alert, Platform, PermissionsAndroid, ToastAndroid, InteractionManager, ...)
  for the app's own code and to react-native-web for node_modules.
- **`vite-plugins/rnRequire.ts`** turns Metro-style `require('./x.png')` / lazy `require('./module')` into ES imports.
- **Native modules** the app reads from `NativeModules` are registered in `src/native/` (downloads, device, sensors, TTS, PDF,
  Kiwix/ZIM, alarms, presentation export). A module that is not registered is "not available", exactly like an Android-only
  module on iOS, and the app already handles that.
- **Engines** (`src/engines/`) hold the real work behind small contracts: text (`llm/`: llama-server on Windows, WebLLM on
  WebGPU, llama.cpp WASM), voices (`tts/`: Kokoro, Piper, system), speech recognition (`stt/`: Whisper via transformers.js),
  ZIM libraries (`zim/`).
- **Host layer** (`src/host/`): the virtual file system (`fs.ts`: OPFS in browsers, real disk in the Windows app through
  `window.atlasHost`), file pick/save (`files.ts`), streaming downloads (`download.ts`), SQLite with FTS5 (`sqlite.ts`).
- **PWA** (`src/pwa/`): service worker (precache, offline shell, COOP/COEP injection so multi-threaded WASM works on static
  hosts), registration, install/update banner.

## Checks (all run in `.github/workflows/atlas-web.yml`)

```
node scripts/smoke.mjs        # boots in headless Chromium, prints console errors, screenshot
node scripts/pwa-check.mjs    # manifest, service worker, offline, cross-origin isolation
node scripts/llm-e2e.mjs      # downloads a tiny GGUF, loads it with the WASM engine, gets a reply
node scripts/voice-e2e.mjs    # Kokoro speaks -> WAV -> Whisper transcribes it back
node scripts/server-backend-test.mjs   # the Windows engine protocol against a mock OpenAI-style server
node scripts/zim-test.mjs     # builds a tiny ZIM and reads it
node scripts/crawl.mjs        # presses every control on every tab, reports crashes
node scripts/crawl2.mjs Settings   # second level
```

`?trace` on the URL logs native-module calls that never finish (used to find hung awaits).
See `../docs/WEB_WINDOWS_PARITY.md` for what works where and `../docs/PORT_STATUS.md` for the running status.
