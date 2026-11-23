# Native runtime inventory (source tree at 0.0.205 + this branch)

Measured from the checkout, not from an APK. Sizes are uncompressed bytes on disk. Nothing here was removed.

| Path | Size | Used by | Note |
|---|---|---|---|
| `android/app/src/main/assets/qnnlibs/libQnnHtpV{68,69,73,75,79,81}.so` | 8.4-12.9 MB each | QNN image generation (LocalDreamModule) | Now only the device's generation is copied to `runtime_libs` (known SoCs); unknown SoCs still get all. |
| `.../qnnlibs/libQnnHtpV*Skel.so` / `*Stub.so` | 8.4-10.2 MB / ~0.5 MB each | same | same rule |
| `.../qnnlibs/libQnnHtp.so`, `libQnnSystem.so` | 2.4 MB each | same | shared, always copied |
| `.../qnnlibs/libstable_diffusion_core.so` | 11.5 MB | QNN diffusion executable | A second build with the same name is in `jniLibs/arm64-v8a` (12.05 MB). Different sizes: not proven redundant. Needs an owner check before touching. |
| `android/app/src/main/assets/ggml-hexagon/libggml-htp-v{69,73,75,79,81}.so` | ~0.4-0.5 MB each | llama.rn Hexagon (HTP) text backend | |
| `node_modules/whisper.rn/.../jniLibs/arm64-v8a/librnwhisper*.so` | 13.8 + 13.8 MB | Whisper STT | Two arm64 variants (fp16 and base). x86_64/armeabi-v7a variants are dropped by the arm64-only build. |
| `android/app/src/main/assets/models` | 24 MB | MiniLM embeddings (offline retrieval) | Required; not redundant. |

Not inventoried (needs a built APK): llama.rn OpenCL/CPU libraries, llama.kt Vulkan, LiteRT-LM, sherpa-onnx, compressed APK sizes. Run `unzip -l` on the CI APK for those.

## Measured from the 0.0.207 release APK (build 208, `Atlas-208.apk`)

Taken with `unzip -l` on the signed arm64 APK produced by CI. Compressed APK: 252,073,591 bytes (240 MiB). Uncompressed contents: 615.7 MB in 1,768 files.

| Part | Uncompressed | Note |
|---|---|---|
| `lib/arm64-v8a/*.so` (native libraries) | 376.4 MB | by far the largest part |
| `assets/qnnlibs` (QNN image generation, one copy per chip generation) | 149.8 MB | at run time only the device's generation is now copied out |
| other assets (models, fonts, voices) | 48.4 MB | includes the 23.85 MiB MiniLM embeddings model |
| `classes*.dex` | 31.4 MB | what R8 could shrink (see `docs/r8-trial.md`); the 0.0.207 trial build measures it |
| `assets/ggml-hexagon` | 4.3 MB | |
| resources | 3.4 MB | |

Largest native libraries: `libatlas_sdcli.so` 72.3 MB (Vulkan image engine), `libllamakt.so` 41.2 MB (Vulkan text), `libatlas_sdcli_opencl.so` 41.2 MB (OpenCL image engine), `libonnxruntime.so` 21.7 MB (voices), `liblitertlm_jni.so` 15.4 MB, then seven llama.rn variants of 11.6 to 14.9 MB each (about 87 MB together: one per CPU feature level plus the Hexagon/OpenCL build), `libstable_diffusion_core.so` 12.1 MB, `libkiwix.so` 11.4 MB, `libzim.so` 9.7 MB.

What this shows, not decides:
- The seven llama.rn builds are chosen at run time by CPU features. Dropping the oldest ones would save about 35 MB but would make older phones fall back to slower code or fail to load: only an option if the supported phones are fixed.
- `libstable_diffusion_core.so` is in the APK twice (12.1 MB in `lib/` and 11.5 MB in `assets/qnnlibs`), two different builds with the same name. Merging them needs a check that the QNN path can run the `lib/` copy.
- The three image engines (`sdcli`, `sdcli_opencl`, `stable_diffusion_core`) total about 125 MB and serve different backends (Vulkan, OpenCL, QNN/MNN); none can be removed by name similarity.

## Size changes in 0.0.211
- Removed `assets/qnnlibs/libstable_diffusion_core.so` (11.5 MB, 4.2 MB compressed): the app always runs the copy in `jniLibs` (extracted to `nativeLibraryDir`; `useLegacyPackaging = true`), so the asset copy was only a fallback that cannot trigger.
- Vector icon fonts limited to Feather and MaterialIcons (the only two used in `src`): about 3.9 MB.
- `localeFilters = ['en']` and `META-INF/*.version`, `DebugProbesKt.bin` excluded.
- Not done (needs a delivery path or has a speed cost): per-chip QNN libraries (about 50 MB for the five chip generations, only one is used on a phone) would need a download on first use; older CPU-feature builds of llama.rn would slow some phones.

## Lean build for one chip
Run `Build Atlas APK` with `qnn_chip` set to V68, V69, V73, V75, V79 or V81 (Razr Ultra 2025: V79). The other generations' `libQnnHtp*` files are left out of the APK through the asset ignore pattern, and the run checks that. Expected saving: about 40 MB compressed. Such a build is uploaded as a workflow file only, and its NPU only works on that chip generation.

## One APK for each CPU type
A published release holds one signed APK for each of arm64-v8a, armeabi-v7a, x86_64 and x86 (`.github/workflows/atlas-apk.yml`: a job for each CPU type, then a last job that publishes the release). What each contains, from the pieces the build uses:

| CPU type | llama.rn engine (on-device AI) | NPU / OpenCL / Vulkan text | Image generation | Natural voices | Whisper | LiteRT |
|---|---|---|---|---|---|---|
| arm64-v8a | seven prebuilt variants | yes | yes | yes | yes | yes |
| x86_64 | `librnllama.so`, `librnllama_x86_64.so` (CPU) | no | no | yes | yes | not checked |
| armeabi-v7a | none (llama.rn is not built for 32-bit) | no | no | yes | yes | not checked |
| x86 | none | no | no | yes | no (whisper.rn has no x86 build) | not checked |

The app does not rely on this table: `src/services/buildCapabilities.ts` reads the libraries the APK really contains (`getConstants().buildInfo` of `DeviceMemoryModule`) and marks a feature missing when its library is not there. The reduced builds also leave out the NPU assets (`-PatlasNoNpu=true`).

