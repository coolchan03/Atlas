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
- [ ] `web/` scaffold: Vite config, aliases for every native package, entry that registers `App`
- [ ] `vite build` succeeds
- [ ] App renders in headless Chromium, no uncaught errors on first screen
- [ ] Every top-level screen opens without a crash (smoke script)

### M2. Web shims for native packages
- [ ] react-native-fs -> OPFS file system (read/write/stat/mkdir/unlink/readDir/copy/move, download with progress)
- [ ] async-storage (web build of the package or localStorage/IndexedDB)
- [ ] react-native-keychain -> WebCrypto-wrapped IndexedDB store
- [ ] document picker, document viewer, image picker (file inputs, camera via getUserMedia)
- [ ] device-info, haptics (vibrate), edge-to-edge, keyboard-controller, reanimated, gesture-handler, svg, vector-icons fonts, slider
- [ ] op-sqlite -> sql.js (RAG database, FTS5)
- [ ] react-native-zip-archive -> fflate
- [ ] react-native-voice -> Web Speech API
- [ ] react-native-audio-api -> Web Audio / MediaRecorder
- [ ] llama.rn -> WASM llama.cpp (wllama), desktop: llama-server
- [ ] whisper.rn -> WASM whisper (or Web Speech fallback), desktop: whisper.cpp

### M3. NativeModules on web
- [ ] DownloadManagerModule (fetch streaming to OPFS, resume, progress events)
- [ ] AtlasDevice (battery, storage, location, share, memory, thermal approximations)
- [ ] AtlasTts (speechSynthesis; desktop: Windows SAPI/OneCore voices)
- [ ] AtlasMediaControls (MediaSession API)
- [ ] AtlasSensor (Generic Sensor / DeviceMotion where available)
- [ ] DeviceMemoryModule, AtlasShare (Web Share API), AtlasQrScanner (BarcodeDetector), AtlasTaskAlarms (Notifications / timers), AtlasPresentationExporter, AtlasVideo, AtlasKiwix, AtlasNearbySync, AtlasSpeakers
- [ ] Unavailable-on-web modules are absent, and the UI hides or explains them (QNN/Vulkan image gen, LiteRT, Kiwix native, nearby sync)

### M4. PWA
- [ ] manifest, icons (any + maskable), theme colors, shortcuts
- [ ] service worker: precache app shell, runtime cache, offline fallback
- [ ] install prompt UI, update prompt
- [ ] storage persistence request, cross-origin isolation headers (COOP/COEP) for threaded WASM
- [ ] Lighthouse-style offline check passes in headless Chromium

### M5. Windows app (Electron)
- [ ] `desktop/` main process, preload bridge (`window.atlasHost`), CSP, single instance, window state
- [ ] file system on disk (Documents/Atlas), downloads with resume
- [ ] llama.cpp via bundled `llama-server.exe` (CPU + Vulkan builds), llama.rn shim talks to it
- [ ] whisper / TTS on desktop
- [ ] electron-builder NSIS installer + portable .exe, icon, file associations (.gguf)
- [ ] auto-update (GitHub releases)

### M6. CI + docs
- [ ] `.github/workflows/atlas-web.yml` (build + deploy to GitHub Pages / artifact)
- [ ] `.github/workflows/atlas-windows.yml` (windows-latest, builds the installer + portable exe, uploads to a release)
- [ ] README sections: Install on Windows, Use on the web
- [ ] `docs/WEB_WINDOWS_PARITY.md`: what works, what degrades, what cannot work

## Log
(newest first; one line per chunk of work)
