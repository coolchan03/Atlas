# Atlas native-image build failure audit — October 8–9, 2026

## Scope
Experimental branch: `atlas-image-native`. This audit is limited to Atlas, the Android image-model pipeline, and the dedicated native-image APK workflow. No upstream OGAM repository, other app, or separate project is modified.

## Evidence and causes

| Actions run | First failing phase | Root cause | Repair |
| --- | --- | --- | --- |
| 37864466376 | Native CMake configure | SPIRV-Headers *CMake package* absent | Pinned SPIRV-Headers package compiled and installed in CI |
| 37865723518 | Vulkan C++ compilation | `vulkan/vulkan.hpp` not in Android NDK include dirs | Pinned Khronos Vulkan-Headers added |
| 37866810548 | Vulkan C++ compilation | `spirv/unified1/spirv.hpp` not exposed to cross compiler | SPIRV include path explicitly passed to CMake |
| 37867063365 | `:app:compileDebugKotlin` during unit test | `java.lang.Process.pid()` unavailable on Android compilation stubs | Optional reflection with guarded fallback; no direct call |

**Why tests before step 11 passed:** JavaScript / TS tests cannot compile the Android Kotlin sources. The expensive native Vulkan compile succeeded, but CI ran Kotlin tests afterward.

## Prevention and review

- Kotlin compilation and native image family/progress tests run **before** the expensive Vulkan compiler. This catches Kotlin source errors before downloading and cross-compiling the shader backend.
- Native `Process.pid()` is **not** used directly. On Android where a public PID accessor exists at runtime, progress diagnostics can read `/proc/PID/stat`; otherwise the optional CPU ticks field is `-1` (unknown). The UI must never represent unknown CPU activity as a detected hang.
- Native engine progress/last-log timestamp does not depend on CPU tick availability.
- Android `packaging.jniLibs.useLegacyPackaging=true` and manifest `android:extractNativeLibs=true` were verified in the working copy. They are required for `ProcessBuilder` to execute the native CLI from the installed app.
- The pinned stable-diffusion.cpp CLI declares `--list-devices`, `--backend`, `--auto-fit`, `--max-vram`, `--llm`, `--threads`, `--diffusion-fa`, and `--log-level`; native runtime code uses those options.
- TypeScript and JavaScript model family checks are not substitutes for Android Kotlin compilation or actual Android runtime/inference.
- Experimental builds use pinned Ubuntu 24.04 and updated GitHub Actions major versions to avoid Node 20 deprecations.

## Verification gates

1. Workflow YAML parses; diff check passes; no direct `process.pid()` calls remain.
2. TypeScript compile and targeted JavaScript image checks pass.
3. Android Kotlin debug unit tests pass.
4. Vulkan native cross-compilation and readelf verification pass.
5. Release APK assembly succeeds and verifies packaged native libs.
6. **Device acceptance, not yet proven:** install on Razr Ultra 2025; ensure test reports actual Vulkan GPU; 1-step Anima smoke test completes, then 512px short render and visually assessed quality render. Test cancellation, repeated generation, memory pressure and thermal behavior.

Do not mark the image engine or model “flawless” until physical-device checks are complete.
