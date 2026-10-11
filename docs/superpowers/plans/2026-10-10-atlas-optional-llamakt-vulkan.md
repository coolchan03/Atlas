# Optional llama.kt Vulkan Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental Vulkan-enabled text GGUF engine to Atlas so the onn Pro 13.2 can use its Mali GPU, without replacing Atlas's current llama.rn engine or regressing the Razr Ultra.

**Architecture:** Package a pinned llama.kt Android library independently of existing llama.rn JNI/JSI; expose narrow Kotlin commands and session-scoped streaming events to React Native. Route opt-in text-only inference through a typed adapter; on unavailable backend, load or decode failure, cleanly revert to the original llama.rn CPU path. Confirm real offload, not merely GPU enumeration.

**Tech Stack:** React Native/TypeScript/Jest, Android Kotlin/Java, Gradle/CMake/NDK, pinned llama.kt, llama.cpp Vulkan/SPIR-V, ARM64 native libraries, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-10-10-atlas-optional-llamakt-vulkan-design.md

## Global Constraints

- Base the experiment on Atlas branch atlas-performance-20261010 (528dccee); use a separate branch; never stage unrelated image, auth, or chat-sync changes.
- Pin public llama.kt revision cad0ec95620d0dd951fc277fec0223f9ea4171e4, with Apache-2.0 license and third-party MIT notices. No unpinned external native binaries.
- Keep Atlas's llama.rn 0.13.0-rc.4 path as default. llama.kt derives from older llama.rn 0.12.6; never substitute old shared objects for new JSI libraries.
- Native library must support ARM64 Android minSdk 29+ (Atlas's minSdk also applies). Build from pinned source, never download model weights or GPU drivers with the APK.
- Upstream llama.kt Gradle scripts assume Vulkan/SPIR-V headers at the root project; as an Atlas submodule, apply versioned Atlas-owned Gradle patches from patches/llama-kt/ before the native build. Never rely on uncommitted edits within vendor/llama-kt.
- Use identical existing GGUF file paths and stable model/conversation identities. Do not copy GGUFs or switch image-generation and multimodal engines.
- Vulkan mode is opt-in and experimental until on-device success. Conservatively test 0/4/8/12 GPU layers on about 8 GB devices subject to actual memory.
- Native backend availability, active backend, and actual offload are distinct; unavailable telemetries display "not reported", not a fabricated layer count.
- A successful CI APK alone is not confirmation of Mali GPU performance; preserve CPU-only recovery.

## Review Focus

- **Parallel native symbols:** existing JSI and new llama.kt loaded in the same process must not collide or crash (Task 2 contract).
- **Bad/huge/URI model input:** preserve the existing validated model file and reject an unresolvable path without copying multi-GB weights or exhausting RAM (Task 3 tests).
- **Interrupt while decoding:** cancellation must work immediately even if generation blocks the model executor, emit one terminal event, and free memory only when safe (Task 3 tests).
- **Stale streaming events:** a previous request's late callback must not appear in a new chat or after switching engines (Task 4 tests).
- **Vulkan device exists but offload fails/zero layers:** show a truthful CPU fallback and no auto-retry loop (Tasks 5–6 tests).

## File Responsibility Map

- `vendor/llama-kt`: pinned upstream git submodule, with checked-in gitlink and licenses (not a copied binary).
- `patches/llama-kt`: tracked patch overlay for Gradle root-relative paths, shader prerequisites and any proven compatibility repairs; enforce clean patch application in CI.
- `android/settings.gradle` and `android/app/build.gradle`: include native Android library as project :atlasLlamaKt; link existing app without modifying current llama.rn.
- `android/app/src/main/java/ai/offgridmobile/atlasvulkan/AtlasVulkanModule.kt`: React Native bridge, serialized load/complete, interrupt, and session events.
- `android/app/src/main/java/ai/offgridmobile/atlasvulkan/AtlasVulkanPackage.kt` and `android/app/src/main/java/ai/offgridmobile/MainApplication.kt`: native module registration.
- `src/services/vulkanEngine.ts`: typed JS command and streaming adapter; one model session, explicit cancellation.
- `src/services/vulkanBackendPolicy.ts`: pure availability, memory and fallback decisions with unit tests.
- `src/services/llm.ts` and `src/services/activeModelService.ts`: select optional text engine while preserving original llama.rn methods and behavior.
- `src/screens/ModelTestScreen.tsx` and existing backend settings: show honest experimental status and measured speed.
- `.github/workflows/atlas-vulkan-experimental.yml` and `scripts/verify-atlas-vulkan-apk.*`: reproducible native build and APK content checks.

---

### Task 1: Pin the Android source and pass a standalone native build gate

**Files:** Create `vendor/llama-kt` gitlink; modify `android/settings.gradle`, `android/app/build.gradle`; create `scripts/check-llamakt-source.*`; test with source contract in CI.

**Interfaces:** Produces Gradle project `:atlasLlamaKt` with upstream Kotlin class `com.tensai.llamakt.LlamaEngine` and `libllamakt.so`; no existing llama.rn API changes.

- [ ] Step 1: Add a source-contract test: exact git submodule commit equals cad0ec95620d0dd951fc277fec0223f9ea4171e4; license present; `ggml-vulkan/ggml-vulkan.cpp` and `tensai_jni.cpp` present.
- [ ] Step 2: Run the contract without integration. Expected FAIL: pinned submodule is not in Atlas.
- [ ] Step 3: Add pinned submodule and Gradle projectDir mapping to `vendor/llama-kt/llama-kt`; add `implementation project(':atlasLlamaKt')` to the app while keeping llama.rn. Track patches in `patches/llama-kt/` so root-relative Vulkan/SPIR-V headers and host tools resolve reproducibly.
- [ ] Step 4: Build `:atlasLlamaKt:assembleRelease` on Linux CI with the pinned NDK/host shader prerequisites; inspect `libllamakt.so`. Expected PASS, native Vulkan compiled; otherwise capture the exact missing dependency/build error.
- [ ] Step 5: Commit only source pin, Gradle integration and contract.

### Task 2: Verify JNI/JSI and shared-library coexistence

**Files:** Create `scripts/verify-atlas-native-coexistence.*` and `android/app/src/test/java/ai/offgridmobile/atlasvulkan/NativeCoexistenceTest.kt`; adjust native build only if validation proves it necessary.

**Interfaces:** Consumes `libllamakt.so` and existing `rnllama` libraries; produces an auditable `NativeCompatibilityReport` with load, export and collision findings.

- [ ] Step 1: Add failing checks: both library families bundled for arm64-v8a; ELF exports/JNI names do not conflict; Vulkan backend symbols and shaders packaged; 16 KB alignment requirements met.
- [ ] Step 2: Run checks on baseline APK. Expected FAIL: optional Vulkan library missing.
- [ ] Step 3: Inspect `readelf` dependency/export output and use an Android native-load smoke test; if symbols collide, implement namespacing/isolation before further integration, never disable a tested safety check.
- [ ] Step 4: Rebuild APK and run the coexistence test. Expected PASS for library availability and clean native initialization.
- [ ] Step 5: Commit compatibility checks and any proven native fix.

### Task 3: Kotlin bridge and safe native session lifecycle

**Files:** Create `AtlasVulkanModule.kt`, `AtlasVulkanPackage.kt` in `android/app/src/main/java/ai/offgridmobile/atlasvulkan/`; update `MainApplication.kt`; test with `android/app/src/test/java/ai/offgridmobile/atlasvulkan/AtlasVulkanModuleTest.kt`.

**Interfaces:** React Native module name `AtlasVulkan`: `listBackends(promise)`, `loadModel(path, gpuLayers, ctx, threads, promise)`, `formatChat(messages, thinking, promise)`, `startCompletion(prompt, sampling, sessionId, promise)`, `interrupt(sessionId, promise)`, `unload(promise)`, `activeBackend(promise)`. Events: `AtlasVulkanToken`, `AtlasVulkanEnd`, `AtlasVulkanError`, each including sessionId.

- [ ] Step 1: Add failing tests for successful load/stream/end, bad model path, missing Vulkan backend, repeated load, interrupt during blocking completion, cleanup after failure, listener registration and process destruction.
- [ ] Step 2: Run `:app:testDebugUnitTest` with module tests. Expected FAIL until bridge is registered.
- [ ] Step 3: Implement serialized native model operations on a dedicated executor; make interrupt callable outside the blocking completion executor; emit exactly one terminal event; close resources in `invalidate()`; sanitize errors.
- [ ] Step 4: Run Kotlin tests and compile app; assert promise settlement once, session isolation and safe unload after interrupt.
- [ ] Step 5: Commit bridge, registration and tests.

### Task 4: Typed React Native adapter and observable sessions

**Files:** Create `src/services/vulkanEngine.ts`, `src/services/vulkanBackendPolicy.ts`, `__tests__/unit/services/vulkanEngine.test.ts`, `__tests__/unit/services/vulkanBackendPolicy.test.ts`.

**Interfaces:** Export `vulkanEngine` with `isAvailable(): Promise<boolean>`, `load(path: string, gpuLayers: number, context: number, threads: number): Promise<void>`, `complete(messages: Array<{role: string; content: string}>, options: VulkanSampling, onToken: (text: string) => void): Promise<string>`, `interrupt(): Promise<void>`, `unload(): Promise<void>` and `getStatus(): Promise<VulkanStatus>`. `VulkanStatus` includes requested backend, active backend, device and reported offload or null.

- [ ] Step 1: Add tests: missing NativeModules returns unavailable; wrong sessionId events ignored; stream preserves token order; stop/dispose ignores late tokens; duplicate terminal events ignored; missing report yields null, not invented GPU layers.
- [ ] Step 2: Run Jest on both files. Expected FAIL: exports not yet defined.
- [ ] Step 3: Add typed bridge binding and pure policy: eligible Android text GGUF only; positive Vulkan device enumeration required; 8 GB initial offload choices 0/4/8/12 with memory gate; CPU fallback when unavailable.
- [ ] Step 4: Run Jest and TypeScript checks; expected passing adapter tests and no unhandled emitter lifecycle errors.
- [ ] Step 5: Commit adapter and unit tests.

### Task 5: Integrate experimental backend with Atlas text generation

**Files:** Modify `src/services/llm.ts`, `src/services/activeModelService.ts`, inference backend settings/type paths as needed; test `__tests__/unit/services/vulkanIntegration.test.ts` plus existing llm/activeModelService suites.

**Interfaces:** Consumes `vulkanEngine` from Task 4 and preserves public `llmService.loadModel`, `generateResponse`, `generateWithMaxTokens`, streaming/cancellation, unload, and `getGpuInfo` methods; defaults to existing llama.rn engine.

- [ ] Step 1: Add failing tests: default still llama.rn; opting into available Vulkan text model uses adapter; vision/tools/audio stay on existing path; Vulkan crash returns to existing llama.rn CPU; switching engines releases old context; chat/model IDs unchanged.
- [ ] Step 2: Run integration tests; expected FAIL for missing engine routing.
- [ ] Step 3: Implement single-owner session dispatch, bounded fallback and old-context cleanup; support disabling experimental mode without clearing history; never overwrite original GGUF.
- [ ] Step 4: Run existing llama/model-loader Jest suites plus new integration tests. Expected all relevant suites pass; report any separate pre-existing failures.
- [ ] Step 5: Commit route and regression tests.

### Task 6: Diagnostic UI and device-specific comparison

**Files:** Modify `src/screens/ModelTestScreen.tsx` and existing text-generation backend settings; create `__tests__/unit/services/vulkanDiagnostics.test.ts`.

**Interfaces:** Consumes `VulkanStatus`, model tester and native timings; displays availability, selected/active engine, GPU device, offloaded layers (or not reported), measured prefill/decode and fallback message.

- [ ] Step 1: Add failing tests for APK with no Vulkan (specific missing-runtime message), Mali with GPU but CPU fallback, 0 actual GPU layers, cancellation, Q4_K_M loading, and benchmark 0/4/8/12 settings.
- [ ] Step 2: Run focused Jest tests and verify missing UI handling.
- [ ] Step 3: Add experimental selection and diagnostic presentation; keep existing model-test layout; compare the same GGUF/prompt without falsifying missing native timing data.
- [ ] Step 4: Run Jest/TypeScript and accessibility checks; confirm default CPU/OpenCL UI unchanged.
- [ ] Step 5: Commit UI and tests.

### Task 7: CI artifact, release safety and physical QA

**Files:** Create `.github/workflows/atlas-vulkan-experimental.yml` and verification script from Task 2; maintain reproducible test ledger in `docs/qa/atlas-vulkan-device-matrix.md`.

**Interfaces:** Builds from pinned native source and publishes experimental arm64 APK only on successful native+JS/package checks; records physical device results separately.

- [ ] Step 1: Add failing CI contract for pinned submodule/third-party licenses, `libllamakt.so` Vulkan backend, original llama.rn JNI libs, 16 KB ELF alignment, Kotlin tests, Jest/TypeScript and APK artifacts.
- [ ] Step 2: Run on current performance branch. Expected FAIL: missing optional Vulkan engine.
- [ ] Step 3: Configure pinned NDK + Vulkan/SPIR-V host dependencies, run all checks and package experimental release without changing production artifact name or existing workflows.
- [ ] Step 4: Install same APK on onn Pro 13.2 and Razr Ultra. Check Q4_K_M GGUF, actual backend/offload, 0/4/8/12 GPU layers, repeatable prefill/decode/first-token and memory/thermal data; capture crashes and fallback logs. If no real device is connected, mark this step NOT TESTED and do not claim it passed.
- [ ] Step 5: Commit workflow/QA ledger, push separate experimental branch and link only the GitHub artifact whose build actually succeeded.

## Plan Self-Review

Coverage: licensing and reproducibility (Task 1), native coexistence (Task 2), Kotlin lifecycle (Task 3), JS stream policy (Task 4), Atlas compatibility and fallback (Task 5), diagnostics and benchmark (Task 6), CI/physical release validation (Task 7). All five review-focus failure modes have explicit tests. No image diffusion, chat-sync or unrelated security files should be committed. Engine remains experimental until actual Mali hardware is verified.
