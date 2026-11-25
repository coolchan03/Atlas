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
- [ ] react-native-voice -> Web Speech API
- [ ] react-native-audio-api -> Web Audio / MediaRecorder
- [x] llama.rn shim over engine layer; wllama backend + llama-server backend written (browser inference NOT yet run end to end: needs a model file)
- [ ] whisper.rn -> WASM whisper (or Web Speech fallback), desktop: whisper.cpp

### M3. NativeModules on web
- [x] DownloadManagerModule (fetch streaming to OPFS, resume, progress events)
- [x] AtlasDevice (crypto byte-compatible with Android, location, compass, torch, wake lock, share, calendar .ics)
- [ ] AtlasTts (speechSynthesis; desktop: Windows SAPI/OneCore voices)
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
1. Smoke-test every top-level screen for crashes (script all tabs / Settings screens)
2. AtlasTts + atlasVoice (speechSynthesis; Kokoro / Piper via WebGPU ONNX), voice input (Web Speech API), whisper (transformers.js)
3. react-native-audio-api shim (recorder, AudioContext player)
4. WebGPU LLM engine (WebLLM) + model catalog entries for it; hide LiteRT/Vulkan/QNN options on web
5. Electron app (desktop/) + llama-server bundling + CI workflows
6. Maps (MapLibre, PMTiles), Kiwix (kiwix-js / zim reader), image generation (WebGPU stable diffusion), QR scanner
7. Install / update banner UI, docs/WEB_WINDOWS_PARITY.md, README

## Log
(newest first; one line per chunk of work)
- 2026-11-25 03:1x: Electron shell verified headless; CI workflows for web + Windows written.
- 2026-11-25 02:xx: PWA manifest/icons/SW/COI done and verified offline; sqlite-wasm; AtlasDevice crypto; engine layer.
