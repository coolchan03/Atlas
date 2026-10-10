# Atlas Dual GPU Backends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one Android ARM64 APK with CPU, Adreno OpenCL, Mali Vulkan, and compatible Hexagon inference with trustworthy GPU/CPU partial offload reporting.

**Architecture:** Preserve Atlas's llama.rn/JSI interface, add a reproducible Vulkan-capable native variant and pre-JSI variant selection, then extend device-aware routing and existing model-test UI. Never simulate native GPU support by a TypeScript toggle.

**Tech Stack:** React Native, TypeScript/Jest, Java/Kotlin, Android Gradle/CMake/NDK, pinned llama.rn 0.13.0-rc.4 API, compatible pinned llama.cpp Vulkan source and shaders.

**Spec:** docs/superpowers/specs/2026-10-10-atlas-dual-gpu-backends-design.md

## Global Constraints

- Work on a separate branch from published atlas-performance-20261010. Keep other branches, security edits, and image-runtime code untouched.
- One APK, same existing GGUF models; retain CPU fallback and Qualcomm OpenCL/Hexagon.
- Native JVM/JSI libraries load once per process; variant changes requiring another JNI library need app restart.
- Current vendored ggml source has no ggml-vulkan directory. Updating Vulkan-capable llama.cpp must be a pinned compatible native-fork operation, not a blind CMake flag.
- Never report Vulkan available until a Vulkan-containing library is packaged, loadable, and enumerates a compatible physical device.
- Approximate 8 GB tablet begins with at most 12 offloaded layers, subject to memory and runtime limits.
- CI and actual-device measurements are separate requirements. No claim of actual Mali acceleration without tested hardware.

## Review Focus

- GPU physically available but Vulkan binary missing: explicitly report missing native variant, not missing GPU.
- Adreno OpenCL regressions when packaging a second JNI library: existing Qualcomm device still initializes.
- Manual backend selection across app restarts: don't hot-unload JSI or lose preferences.
- Driver fails during partial offload: exactly bounded retries, then CPU, no startup loop.
- Runtime claims GPU selected but offloaded zero model layers: report actual CPU and reason.

---

### Task 1: Pinned Vulkan-capable native-source integration

**Files:** native llama.rn fork or tracked patch files; Android source build configuration; tests for source-contract verification.

**Interfaces:** produces a reproducible pinned native source tree providing ggml-vulkan and matching llama.rn 0.13.0-rc.4 JNI/JSI ABI.

- [ ] Step 1: Write source-contract test asserting pinned source SHA, ggml-vulkan presence, compatible ABI, and generated shader dependencies.
- [ ] Step 2: Run contract and observe failure because current llama.rn vendor lacks ggml-vulkan.
- [ ] Step 3: Add pinned compatible fork/source and build instructions; fail closed if Vulkan sources are absent. Avoid mixing unmatched ggml headers and prebuilt binaries.
- [ ] Step 4: Run contract. Expected: PASS and Vulkan shader source files are present.
- [ ] Step 5: Commit only native source integration and its test.

### Task 2: Build both native variants into one ARM64 APK

**Files:** native fork android/src/main/rnllama/CMakeLists.txt; android/src/main/CMakeLists.txt; Gradle config and CI workflow; Android source-contract tests.

**Interfaces:** consumes Task 1 pinned source; produces CPU, OpenCL/Hexagon, and Vulkan JNI library variants with distinguishable backend registration.

- [ ] Step 1: Write failing package-contract test for Vulkan JNI and ggml shader symbols, ARM64 architecture, no mandatory libOpenCL.so dependency for Vulkan variant, and CPU/OpenCL preservation.
- [ ] Step 2: Run test. Expected: FAIL for missing Vulkan variant.
- [ ] Step 3: Compile ggml-vulkan with Android Vulkan loader/shaders, create and package dedicated Vulkan JNI variant, preserve CPU and Qualcomm variants.
- [ ] Step 4: Build release APK and inspect ELF dependency list and APK entries. Expected: all native variants present, valid matching exports and no unintended dependencies.
- [ ] Step 5: Commit native variant build and package contract.


### Task 3: Startup native backend detection and safe selection

**Files:** native fork android/src/main/java/com/rnllama/RNLlama.java; Java unit tests; small native Vulkan capability probe.

**Interfaces:** consumes Task 2 variants; produces process-start backend selection and capability reporting.

- [ ] Step 1: Write failing tests for Mali/Vulkan, Adreno/OpenCL, CPU fallback, absent Vulkan loader and restart-required switching.
- [ ] Step 2: Run failing tests and confirm missing native loader paths.
- [ ] Step 3: Implement a Vulkan physical-device probe before JSI startup; select native variant exactly once; catch native library failures and use CPU.
- [ ] Step 4: Run Java tests and ARM64 build. Expected: correct variant selected and no unsafe hot unload.
- [ ] Step 5: Commit loader and tests.

### Task 4: Backend selection and bounded CPU/GPU offloading

**Files:** src/types/index.ts; src/services/hardware.ts; src/utils/acceleration.ts; src/services/llm.ts; src/services/llmHelpers.ts; related Jest tests.

**Interfaces:** consumes native capabilities from Task 3; produces actual selected backend and offload telemetry.

- [ ] Step 1: Write failing tests for Mali Vulkan, Adreno OpenCL, eligible Hexagon, unsupported quant, legacy settings, 8 GB safe layers, CPU fallback and zero-layer GPU claims.
- [ ] Step 2: Verify tests fail only due to missing Vulkan support/routing.
- [ ] Step 3: Add Vulkan preference, compatibility checks, conservative offload, resource-error retry once and CPU recovery.
- [ ] Step 4: Run focused and full Jest suites and check no existing device regressions.
- [ ] Step 5: Commit logic and tests.

### Task 5: Truthful acceleration UI and benchmark

**Files:** generation settings; src/screens/ModelTestScreen.tsx; speed tracking; Jest UI tests.

**Interfaces:** consumes Task 4 backend and offload measurements.

- [ ] Step 1: Write failing tests for missing Vulkan binary explanation, requested GPU with zero offloaded layers, and native variant switch requiring restart.
- [ ] Step 2: Verify tests fail for expected reasons.
- [ ] Step 3: Surface Automatic/OpenCL/Vulkan/CPU and eligible HTP options, actual device/layers, fallback reasons, prefill and decode tok/s.
- [ ] Step 4: Run Jest and targeted lint; keep native prefill separate from wall-clock generation.
- [ ] Step 5: Commit UI and tests.

### Task 6: Deterministic build and device validation

**Files:** dedicated dual-backend GitHub Actions workflow or existing experimental pipeline; APK verification scripts; test ledger.

**Interfaces:** consumes Tasks 1–5; produces experimental APK only when verified native dependencies are packaged.

- [ ] Step 1: Write CI contract asserting Vulkan and OpenCL native variants, CPU fallback, JNI symbols and ARM64 libraries.
- [ ] Step 2: Confirm current CPU/OpenCL-only build fails expected Vulkan assertions.
- [ ] Step 3: Build pinned Android native binaries, run Jest/TypeScript/Kotlin/native checks, verify final APK entries.
- [ ] Step 4: Test the same Q4_K_M GGUF on Razr Ultra and onn Pro 13.2 using CPU and partial GPU layers; measure actual layers, first token, native prefill/decode speed, memory and heat.
- [ ] Step 5: Publish only on passing CI. Mark APK experimental until on-device Mali and Adreno testing confirms acceleration.

## Self-review

The six tasks cover source integration, binary packaging, native selection, hybrid offloading, UI and diagnostics, and verified release. Tasks 1–3 are prerequisites for truthful Vulkan capability; Task 4 requires Task 3; Task 5 requires Task 4. The current installed llama.rn source does not contain ggml-vulkan, so no TypeScript-only option can satisfy Task 1. Preserve the existing CPU/OpenCL path; a failed native build remains a blocker, not a reason to advertise unsupported Vulkan.
