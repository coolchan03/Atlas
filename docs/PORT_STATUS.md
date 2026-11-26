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
- [x] Every screen reachable from the five tabs opens without a crash (`web/scripts/crawl.mjs` first level on all tabs, `crawl2.mjs` second level on Home, Chats, Workspace, Language, Settings: no problems)

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
- [x] DeviceMemoryModule, AtlasShare, AtlasTaskAlarms, AtlasPresentationExporter (PDF + PPTX), AtlasKiwix (own ZIM reader), AtlasSpeakers (file to WAV), PDFExtractorModule, map view + AtlasDevice.mapInfo/mapPlaces. AtlasVideo (narrated slides saved as MP4/WebM: canvas + MediaRecorder, real time; needs a natural voice such as Kokoro). AtlasNearbySync on Windows only (`desktop/lib/nearby.cjs`: the Android sync protocol over the local network, tested PC to PC in `desktop/test/nearby-test.cjs`, incl. wrong key, replay, one-use invitations; PC to phone interop is written from the Android source but not yet tried against a phone). Not implemented (absent, the app hides them): AtlasQrScanner (the PC shows the QR code and the phone scans it, or paste the link)
- [x] Unavailable modules are absent and the UI hides or explains them (LiteRT hidden in Models; image generation and nearby sync show the app's own "not available" messages)

### M4. PWA
- [x] manifest, icons (any + maskable), theme colors, shortcuts, share target, file handlers
- [x] service worker: precache app shell, runtime cache, offline fallback, COOP/COEP injection
- [x] install prompt UI, update prompt (`web/src/pwa/banner.ts`; the service worker waits for the Update button)
- [x] storage persistence request, cross-origin isolation headers (COOP/COEP) for threaded WASM
- [x] offline check passes in headless Chromium (`web/scripts/pwa-check.mjs`)

### M5. Windows app (Electron)
- [x] `desktop/` main process, preload bridge (`window.atlasHost`), CSP, single instance, window state (verified: `ATLAS_SELFTEST=1 electron .` under xvfb passes: isolation, SharedArrayBuffer, WebGPU, disk fs, FTS5)
- [x] file system on disk (userData/data), downloads with resume, atlas-file:// streaming protocol
- [x] (verified on a Windows runner, run 27: the packaged Atlas.exe answered a real model through llama.cpp b12716's llama-server.exe, CPU build; GPU/Vulkan untested - no GPU on runners) llama.cpp via bundled `llama-server.exe`: manager (`desktop/lib/llama.cjs`) + renderer backend written, `scripts/fetch-llama.mjs` downloads CPU/Vulkan/CUDA builds in CI. NOT run against a real model yet (no llama.cpp binaries reachable from the build sandbox)
- [x] whisper / TTS on desktop (same in-app engines as the web build: Whisper via transformers.js, Kokoro/Piper, Windows system voices)
- [x] electron-builder config: NSIS installer + portable + zip, icon, .gguf association. `--win --dir` verified on Linux (produces Atlas.exe); installers are built by CI on windows-latest
- [x] auto-update wired (electron-updater, GitHub provider)

### M6. CI + docs
- [x] `.github/workflows/atlas-web.yml` (build + browser checks + deploy to GitHub Pages / artifact)
- [x] `.github/workflows/atlas-windows.yml` (windows-latest, builds the installer + portable exe + zip, optional release)
- [x] README sections: Use it on Windows or in a browser; web/README.md and desktop/README.md
- [x] `docs/WEB_WINDOWS_PARITY.md`: what works, what degrades, what cannot work

## Next up (in order)
Done and verified: web build, PWA (offline, install, COOP/COEP), OPFS + worker fallback, sqlite/FTS5, downloads, LLM (WASM), WebGPU catalog (written, GPU untested), Kokoro + Piper + system TTS, Whisper, mic recorder, PDF, ZIM reader, alarms, presentation PDF, Electron shell + stand-in engine, CI workflows, docs, UI crawl (first level clean).

Remaining ideas (optional features, none blocks the web or Windows app), most valuable first:
1. Second-level crawl results (`/tmp/crawl2-*.log`; run `node web/scripts/crawl2.mjs <Tab>` for Home / Chats / Workspace / Language / Settings) and fix what it finds.
2. Run the Windows workflow on GitHub (cannot be run from the build sandbox): confirm llama.cpp asset names in `desktop/scripts/fetch-llama.mjs`, the installer, and the Windows self-test.
3. (done) Offline maps: Mapsforge reader (`web/src/engines/mapsforge`) + canvas `AtlasMapView` (`web/src/map`), verified on a real map (`scripts/map-test.mjs`). Open: better styling, hillshade/contours, text on roads along the line.
4. Image generation. DONE on Windows: stable-diffusion.cpp's `sd-cli.exe` is bundled (`desktop/scripts/fetch-sd.mjs`, CPU + Vulkan builds), run as a child process by `desktop/lib/sd.cjs`, and exposed to the app as the same `LocalDreamModule` the Android build has (`web/src/native/localdream.ts`: import, inspect, attach LoRA / VAE / text encoders, load, generate with step progress and previews, cancel, gallery). Models > Image lists SD 1.5, SD-Turbo, SDXL-Turbo and SDXL GGUF files read live from Hugging Face (`web/src/native/imageCatalog.ts`); a .safetensors / .gguf checkpoint can also be imported from disk. VERIFIED: the real `sd-cli.exe` on a Windows runner makes a 256x256 SD-Turbo image on the CPU in about 22 s through the app's own engine manager (`desktop/test/sd-real.cjs`, workflow `atlas-sd-probe.yml`); the page flow (import, load, generate, progress, gallery, delete) runs in the Electron self-test against a stand-in engine. NOT VERIFIED: the Vulkan GPU path (the runners have no GPU; the arguments are the Android module's, and a missing GPU falls back as the app's settings say), FLUX and the other multi-file families. Browser (PWA): not available, there is no child process; WebGPU Stable Diffusion remains an idea.
5. MediaPipe GenAI (WebGPU) as a LiteRT engine for the Gemma .litertlm files.
6. DONE on Windows: nearby sync (PC to phone / PC to PC). Browser: not possible without a relay server (no listening sockets); a WebRTC link with a copied pairing code would be the way. QR scanning in the PC app: not needed, the phone scans the PC's code.
7. (done) Windows: tray + close-to-tray while downloads or AI work run, taskbar progress, `atlas://` links, open `.gguf` with Atlas.

## Log
(newest first; one line per chunk of work)
- 2026-11-26 01:30: Updates fixed per platform. The app's updater downloads an Android .apk; the web and Windows builds now use their own (`web/src/updater.ts`: the PWA through its service worker, the exe through electron-updater). The exe's feed is the rolling release `atlas-windows-latest` (generic provider), and Windows releases are created with `--latest=false`, so they can neither be mistaken for the Android build nor take over `/releases/latest`. Start-up: optional steps (WebGPU model list, image list) can no longer stop the app opening, and a start-up failure now shows the error with Reload / "Clear cached copy" instead of the bare word "Atlas" (`web/src/fatal.ts`, tested by `scripts/fatal-test.mjs`). The live Pages site was checked with `scripts/pwa-check.mjs`.
- 2026-11-25 15:10: Indexing pipeline slice 1 (all modes of the existing importer, no model needed): `rag/convert.ts` (encoding repair, running header/footer removal, web pages and CSV as Markdown; every removal reported in the import note), `rag/structure.ts` (segmentation at provisions, articles, numbered headings, Q&A; tables cut with their header repeated), content-hash dedupe per project (`rag_documents.content_hash`). Tested in jest (real SQLite for the hash). STILL TO DO: OCR beyond the existing PDF scan path, Word/Excel/PowerPoint/EPUB structure, fast/hybrid/deep modes, classification, resumable streaming for multi-GB collections, index export/import, citation tap-to-open and answer checking in the chat UI.
- 2026-11-25 14:30: **Research libraries** (docs/research_libraries.md): general pre-indexed read-only libraries (manifest, column-mapped SQLite, FTS5, byte-range reads), zip install with validation, per-project switch in Knowledge Base, automatic retrieval before every answer for any model, six library tools, a legal-US profile as the first subject plug-in. TESTED: core against real SQLite (jest), existing Knowledge Base tests, tsc, eslint. NOT DONE from the larger "local conversion and indexing" brief: the on-device conversion pipeline (Markdown/TXT conversion, OCR, header/footer cleanup), structure-aware segmentation, indexing modes (fast/hybrid/deep), classification, hashing/dedup/resume/streaming for the existing importer, index export/import, tap-to-open citations and the answer check in the chat UI, a viewer for converted text. NOT VERIFIED on a device: install of a multi-GB zip, op-sqlite opening a library by location, byte-range reads on Android.
- 2026-11-25 12:50: Narrated slide video export on the web build (canvas + MediaRecorder, MP4 or WebM; `scripts/video-test.mjs` in CI). Core Audit jest fixed (quickImport mock). The Pages site: a `gh-pages` push is blocked by GitHub push protection (a model class name in the bundle looks like a Mistral key), so the workflow now deploys with the Pages artifact action; it needs Settings > Pages > Source: GitHub Actions once (until then the publish step warns and skips). Desktop: quantized V cache now turns flash attention on.
- 2026-11-25 05:40: run 27 green incl. the real llama-server.exe answering through the packaged Windows app.
- 2026-11-25 05:30: **GitHub Actions now builds everything.** "Build Atlas for Windows" run 26 is green on windows-latest: web build, llama.cpp b12716 (CPU + Vulkan) bundled, packaged Atlas.exe passes its self-test on Windows, installer + portable exe + zip produced (artifact `atlas-windows`, 591 MB). "Build Atlas web (PWA)" passes install, type-check, build, PWA/offline, LLM, voice, ZIM checks. Fixes it took: onnxruntime-node install script (web/.npmrc), Windows path separators and case-insensitive resolution in the Vite plugins (Board.tsx vs board.ts), llama.cpp release lookup, ignored desktop/build icons.
- 2026-11-25 05:00: Offline maps done (Mapsforge reader verified on Monaco, canvas map view, place search for the AI). ZIM reader fixed on a real Wikipedia ZIM (found by testing on real data). crawl2 Settings clean. Windows: CORS pass-through for downloads, open .gguf with Atlas verified.
- 2026-11-25: UI crawl (web/scripts/crawl.mjs, ~87 controls over all tabs) found no crashes. ZIM reader tested on a generated ZIM (zim-test.mjs), Piper voices verified, Electron shell downloads and runs a real model through the WASM engine.
- 2026-11-25: VERIFIED through the real UI in headless Chromium: Models search -> download GGUF -> select -> chat reply -> reload keeps model and chat. Desktop widths use the app's tablet rail layout. PDF (pdf.js) and task-alarm modules added.
- 2026-11-25: VERIFIED in headless Chromium (web/scripts/llm-e2e.mjs, voice-e2e.mjs): GGUF download -> wllama load -> reply (14 tok/s on a 135M model, CPU); Kokoro speaks -> WAV -> Whisper tiny.en returns the exact sentence. WebGPU model catalog (WebLLM) written (not run: no GPU in the sandbox).
- 2026-11-25 (after restart): TTS, voice input, audio recorder, whisper, Image file:// shim, LiteRT hidden on web. `web/scripts/crawl.mjs` presses every button on every tab to find crashes (run after each change).
- 2026-11-25 03:1x: Electron shell verified headless; CI workflows for web + Windows written.
- 2026-11-25 02:xx: PWA manifest/icons/SW/COI done and verified offline; sqlite-wasm; AtlasDevice crypto; engine layer.
