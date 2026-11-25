# Atlas on the web (PWA) and Windows: what works

The web app and the Windows app are the same React Native code as the Android app (`src/`, `App.tsx`), compiled with
react-native-web. Native features are provided by web implementations in `web/src/` (see `docs/PORT_STATUS.md` for the
architecture). This page lists what you get on each platform and what cannot work.

Legend: **full** = same as Android. **partial** = works with limits. **no** = not possible there.

| Area | Android | Web (PWA) | Windows app |
|---|---|---|---|
| Screens, navigation, themes, chats, projects, agents, learning mode, study mode, backup | full | full | full |
| Storage | app folder | browser storage (OPFS), persistent when installed | real files in `%APPDATA%\Atlas\data` |
| Text models (GGUF) | llama.cpp native, NPU / OpenCL / Vulkan | **partial**: llama.cpp in WebAssembly on the CPU (SIMD, multi-threaded). Files up to about 2 GB per model. 1-4B models are usable | **full speed**: bundled `llama-server` (CPU, Vulkan for NVIDIA / AMD / Intel GPUs, optional CUDA), any GGUF size, tools, thinking, vision (mmproj) |
| Models on a computer on your network (Ollama, LM Studio) | full | full (the server must allow CORS) | full |
| WebGPU models | no | planned (WebLLM) | planned |
| LiteRT models, Qualcomm NPU, Hexagon, QNN | yes | no (hidden) | no (hidden). Windows machines have no NPU path here |
| Vision (pictures to a model) | full | no (text only in WASM) | full with a vision model + projector |
| Image generation | full | no | no (planned: stable-diffusion.cpp) |
| Natural voices (Kokoro) | full | **full**: Kokoro-82M on WebGPU (WASM fallback), cached for offline use | full (same engine) |
| Piper voices (Amy, Ryan, Lessac, Joe, HFC) | full | **full** (VITS ONNX, cached for offline use) | full |
| KittenTTS, Pocket TTS voice cloning, imported voice files | full | no | no |
| System voice (read aloud) | Android voices | browser / OS voices (on Windows: the installed Windows voices) | Windows voices |
| Speech to text | Whisper (whisper.cpp) | Whisper through transformers.js (WebGPU / WASM), offline after the first download; browser speech recognition as the "system" recogniser | same as web |
| Hands-free voice mode, read aloud, podcasts (with Kokoro) | full | full | full |
| Offline library (Atlas packs), search, RAG | full | full (SQLite + FTS5 in WebAssembly, saved to browser storage) | full |
| Kiwix encyclopedias (ZIM) | native libkiwix, full-text search | **partial**: in-app ZIM reader (zstd / xz / stored clusters), search by article title, article text. No full-text (Xapian) search. Downloading from Kiwix mirrors from a browser can be blocked by the mirror's CORS rules: download the .zim and import it with the file picker | same reader, no CORS limit |
| Offline maps (Mapsforge) | native map view | **works**: in-app Mapsforge reader and canvas map (roads, buildings, water, labels, saved places, GPS dot, "what is near me" place search). Map servers do not allow downloads from web pages (no CORS): download the .map from download.mapsforge.org and add it with Maps > Maps on phone | **works**, and the map downloader works too |
| GPS, compass, torch, sensors | yes | where the browser exposes them (phones: GPS, compass, light, motion; torch on some Android Chrome) | location by IP / Windows location service; no compass or torch on most PCs |
| Camera / photo import | yes | yes (file picker, camera capture on phones) | file picker |
| Documents (PDF, Word, ...) | yes | yes (PDF through pdf.js incl. page images for scans) | yes |
| Share to Atlas | Android share sheet | PWA share target (text and links) | open files with Atlas (.gguf and documents) |
| Reminders / alarms | exact alarms | notifications while the app is open | notifications while the app runs |
| Background work with the screen off | foreground service | limited by the browser (a screen wake lock is held during downloads and generation) | **full** (the window can be hidden; downloads and generation continue) |
| PIN-protected chats, encrypted backups | Android Keystore | WebCrypto (same file formats: a backup made on Android restores here) | WebCrypto + Windows DPAPI for secrets |
| Install | APK | "Install" in Chrome / Edge / Safari "Add to Home Screen" | Setup exe, portable exe, zip |
| Updates | APK | automatic service-worker update | automatic (GitHub releases) |

## How offline works on the web

1. Open the site once. The service worker downloads the whole app (about 40 MB) and keeps it.
2. Install it (Install button, or the browser's menu). It then opens like a normal app with no network.
3. Models, voices and library packs are downloaded by the app itself into browser storage and stay there. The browser can
   evict storage under pressure; installing the app and the "persistent storage" request the app makes prevent that.
4. The first time you use Whisper or a Kokoro voice the model is fetched from Hugging Face. After that it is cached.

## Known limits of the browser build

- **Memory.** A browser tab can address about 4 GB of WebAssembly memory, and mobile browsers give a tab far less. A 7B model will
  not load in a browser. Use the Windows app, or a model server on your network.
- **Safari / iOS.** WebGPU and multi-threaded WebAssembly need a recent Safari. Voice and offline library work; large models do not.
- **Firefox.** Works; WebGPU is behind a flag on some versions, so Kokoro and Whisper fall back to the slower WebAssembly path.
- **Speech recognition by the browser.** Chrome can send audio to its speech service when on-device recognition is not installed.
  Whisper (Models > Speech) never leaves the device.
- **File access.** A browser cannot read arbitrary folders. Imports go through the file picker. The Windows app can open any file
  you pick and keeps its data in a normal folder you can back up.

## Windows app: requirements and troubleshooting

- Windows 10 or 11, 64-bit. Roughly 700 MB of disk for the app and more for models (stored in `%APPDATA%\Atlas\data`, open it from Help > Open the data folder).
- **AI engine.** The installer bundles llama.cpp (`llama-server.exe`): a Vulkan build (NVIDIA, AMD and Intel GPUs, current graphics driver) and a CPU build. Atlas picks the GPU build when a GPU is found and falls back to the CPU build, then to the in-app WebAssembly engine.
  If the engine does not start, install the "Microsoft Visual C++ Redistributable (x64)" and update the graphics driver.
- **Speech and natural voices** (Whisper, Kokoro, Piper) run inside the app on the GPU through WebGPU, or on the CPU. They download once, then work offline.
- **Models on another computer** (Ollama, LM Studio) work as on the phone: Models > Add Remote Server.
- **Unsigned installer.** Builds are not code signed, so Windows SmartScreen may say "unknown publisher": More info > Run anyway.
- **Updates** come from GitHub releases (the app checks 15 seconds after start and installs on exit).
- **WebGPU models** (the "(WebGPU)" entries in Models) run on the GPU inside the app. GPUs without 16-bit shader support automatically get the 32-bit builds of the same models.
