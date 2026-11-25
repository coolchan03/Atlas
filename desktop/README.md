# Atlas for Windows (Electron)

Wraps the web build (`../web`) in a desktop window and adds what a browser cannot do: real files, a bundled llama.cpp
engine (CPU / Vulkan / optional CUDA), secrets in the Windows DPAPI, native dialogs, file association for `.gguf`,
auto-update from GitHub releases.

```
cd desktop
npm ci
npm run web                    # builds ../web with ATLAS_TARGET=desktop -> ../web/dist-desktop
npm run llama                  # downloads llama-server.exe builds into resources/llama (LLAMA_VARIANTS=cpu,vulkan,cuda)
npm start                      # run in dev
npm run dist                   # Setup exe + Portable exe  (on Windows; CI does this)
npm run pack                   # unpacked app (dist/win-unpacked/Atlas.exe) - works on any OS
ATLAS_SELFTEST=1 electron .    # start-up test; ATLAS_SELFTEST_LLM=1 also runs a model; ATLAS_LLAMA_DIR=test/fake-llama
```

- `main.cjs` window, session (permissions, CSP), IPC. `preload.cjs` exposes `window.atlasHost` (the web app checks for it).
- `lib/diskfs.cjs` real-disk file system behind the virtual paths (`/atlas/...` -> `%APPDATA%\Atlas\data`); only the data
  folder and paths a person picked in a dialog are reachable.
- `lib/llama.cjs` runs `llama-server` per loaded model, tries CUDA, then Vulkan, then CPU, and talks to it over loopback.
- `lib/protocol.cjs` `app://` (the bundled web app, with COOP/COEP) and `atlas-file://` (streams files with Range support).
- Data lives in `%APPDATA%\Atlas\data` (Help > Open the data folder).
