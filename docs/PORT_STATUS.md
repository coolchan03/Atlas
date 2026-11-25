# Atlas web (PWA) + Windows (.exe) port: running status

This file is the working plan. Every session (and every scheduled check-in) reads it first, does the next unchecked items, and updates it.

## Architecture

One React Native codebase (`src/`, `App.tsx`) runs three ways:

| Target | Runtime | Entry | Build |
|---|---|---|---|
| Android / iOS | React Native 0.83 | `index.js` | Gradle / Xcode (unchanged) |
| Web / PWA | react-native-web + Vite | `web/src/main.tsx` | `cd web && npm run build` |
| Windows .exe | Electron wrapping the web build + a Node host for native work | `desktop/main.cjs` | `cd desktop && npm run dist` |

Rules for the port (so the mobile app is never touched or broken):
- `src/` is not forked. The web build swaps native packages for web implementations with Vite aliases (`web/vite.config.ts`). Native modules that the app reads from `NativeModules` get web implementations registered in `web/src/native/` (the app already treats a missing module as "feature not available", so anything not implemented degrades the same way iOS does for Android-only features).
- Every native capability has one web contract (`web/src/host/`). In a browser it is implemented with browser APIs (OPFS, Web Audio, Web Speech, WASM llama.cpp). In the Windows app `window.atlasHost` (from `desktop/preload.cjs`) overrides it with real Node/native implementations (disk files, `llama-server`, whisper.cpp, TTS). The UI never branches on which one is active.
- Web tooling lives in `web/package.json` and `desktop/package.json`, with their own lockfiles, so the mobile `package-lock.json` is untouched.

## Milestones

### M1. Web build boots
- [x] `web/` scaffold: Vite config, aliases for every native package, entry that registers `App`
- [x] `vite build` succeeds
- [x] App renders in headless Chromium, no uncaught errors on first screen (`web/scripts/smoke.mjs`)
- [ ] Every top-level screen opens without a crash (smoke script)

### M2. Web shims for native packages
- [x] react-native-fs -> OPFS file system (read/write/stat/mkdir/unlink/readDir/copy/move, download with progress)
- [x] async-storage (package's own web build, localStorage)
- [x] react-native-keychain -> WebCrypto-wrapped IndexedDB store
- [x] document picker, document viewer, image picker (file inputs, camera capture)
- [x] device-info, haptics (vibrate), edge-to-edge, keyboard-controller, reanimated (own implementation), gesture-handler (package web build), svg (package web build), vector-icons fonts, slider
- [x] op-sqlite -> official sqlite-wasm (FTS5), saved to OPFS
- [x] react-native-zip-archive -> fflate
- [x] react-native-voice -> Web Speech API (processLocally where supported)
- [x] react-native-audio-api -> Web Audio (recorder writes WAV to the virtual fs, decodeAudioData reads app paths)
- [x] llama.rn shim over engine layer; wllama backend + llama-server backend written (browser inference NOT yet run end to end: needs a model file)
- [x] whisper.rn -> transformers.js Whisper (WebGPU/WASM); the ggml .bin download is replaced by an ONNX model fetch + marker file (both browser and Windows app)

### M3. NativeModules on web
- [x] DownloadManagerModule (fetch streaming to OPFS, resume, progress events)
- [x] AtlasDevice (crypto byte-compatible with Android, location, compass, torch, wake lock, share, calendar .ics)
- [x] AtlasTts (speechSynthesis incl. Windows voices; Kokoro natural voices via kokoro-js on WebGPU/WASM; stream speaking; synthesizeToFile with Kokoro)
- [x] AtlasMediaControls (MediaSession API)
- [x] AtlasSensor (Generic Sensor API where available)
- [ ] DeviceMemoryModule, AtlasShare (Web Share API), AtlasQrScanner (BarcodeDetector), AtlasTaskAlarms (Notifications / timers), AtlasPresentationExporter, AtlasVideo, AtlasKiwix, AtlasNearbySync, AtlasSpeakers
- [ ] Unavailable-on-web modules are absent, and the UI hides or explains them (QNN/Vulkan image gen, LiteRT, Kiwix native, nearby sync)

### M4. PWA
- [x] manifest, icons (any + maskable), theme colors, shortcuts, share target, file handlers
- [x] service worker: precache app shell, runtime cache, offline fallback, COOP/COEP injection
- [ ] install prompt UI, update prompt
- [x] storage persistence request, cross-origin isolation headers (COOP/COEP) for threaded WASM
- [x] offline check passes in headless Chromium (`web/scripts/pwa-check.mjs`)

### M5. Windows app (Electron)
- [x] `desktop/` main process, preload bridge (`window.atlasHost`), CSP, single instance, window state (verified: `ATLAS_SELFTEST=1 electron .` under xvfb passes: isolation, SharedArrayBuffer, WebGPU, disk fs, FTS5)
- [x] file system on disk (userData/data), downloads with resume, atlas-file:// streaming protocol
- [~] llama.cpp via bundled `llama-server.exe`: manager (`desktop/lib/llama.cjs`) + renderer backend written, `scripts/fetch-llama.mjs` downloads CPU/Vulkan/CUDA builds in CI. NOT run against a real model yet (no llama.cpp binaries reachable from the build sandbox)
- [ ] whisper / TTS on desktop
- [x] electron-builder config: NSIS installer + portable + zip, icon, .gguf association. `--win --dir` verified on Linux (produces Atlas.exe); installers are built by CI on windows-latest
- [x] auto-update wired (electron-updater, GitHub provider)

### M6. CI + docs
- [x] `.github/workflows/atlas-web.yml` (build + browser checks + deploy to GitHub Pages / artifact)
- [x] `.github/workflows/atlas-windows.yml` (windows-latest, builds the installer + portable exe + zip, optional release)
- [ ] README sections: Install on Windows, Use on the web
- [ ] `docs/WEB_WINDOWS_PARITY.md`: what works, what degrades, what cannot work

## Next up (in order)
Done and verified: web build, PWA (offline, install, COOP/COEP), OPFS + worker fallback, sqlite/FTS5, downloads, LLM (WASM), WebGPU catalog (written, GPU untested), Kokoro + Piper + system TTS, Whisper, mic recorder, PDF, ZIM reader, alarms, presentation PDF, Electron shell + stand-in engine, CI workflows, docs, UI crawl (first level clean).

Remaining ideas, most valuable first:
1. Second-level crawl results (`/tmp/crawl2-*.log`; run `node web/scripts/crawl2.mjs <Tab>` for Home / Chats / Workspace / Language / Settings) and fix what it finds.
2. Run the Windows workflow on GitHub (cannot be run from the build sandbox): confirm llama.cpp asset names in `desktop/scripts/fetch-llama.mjs`, the installer, and the Windows self-test.
3. Offline maps (Mapsforge): needs a JS Mapsforge reader + a web `AtlasMapView`; or MapLibre with a different data source.
4. Image generation on the web (WebGPU Stable Diffusion) and on Windows (stable-diffusion.cpp as another bundled child process).
5. MediaPipe GenAI (WebGPU) as a LiteRT engine for the Gemma .litertlm files.
6. QR scan (BarcodeDetector) and nearby sync over WebRTC.
7. Windows: tray + close-to-tray, open `.gguf` with Atlas (the preload already forwards the path: `atlasHost.onOpenFile`), protocol handler `atlas://`.

## Log
(newest first; one line per chunk of work)
- 2026-11-25: UI crawl (web/scripts/crawl.mjs, ~87 controls over all tabs) found no crashes. ZIM reader tested on a generated ZIM (zim-test.mjs), Piper voices verified, Electron shell downloads and runs a real model through the WASM engine.
- 2026-11-25: VERIFIED through the real UI in headless Chromium: Models search -> download GGUF -> select -> chat reply -> reload keeps model and chat. Desktop widths use the app's tablet rail layout. PDF (pdf.js) and task-alarm modules added.
- 2026-11-25: VERIFIED in headless Chromium (web/scripts/llm-e2e.mjs, voice-e2e.mjs): GGUF download -> wllama load -> reply (14 tok/s on a 135M model, CPU); Kokoro speaks -> WAV -> Whisper tiny.en returns the exact sentence. WebGPU model catalog (WebLLM) written (not run: no GPU in the sandbox).
- 2026-11-25 (after restart): TTS, voice input, audio recorder, whisper, Image file:// shim, LiteRT hidden on web. `web/scripts/crawl.mjs` presses every button on every tab to find crashes (run after each change).
- 2026-11-25 03:1x: Electron shell verified headless; CI workflows for web + Windows written.
- 2026-11-25 02:xx: PWA manifest/icons/SW/COI done and verified offline; sqlite-wasm; AtlasDevice crypto; engine layer.
