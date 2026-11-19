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
