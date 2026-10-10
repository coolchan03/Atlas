# Atlas: one APK with OpenCL, Vulkan, Hexagon and CPU inference

**Date:** 2026-10-10
**Status:** Design proposed for written-spec review; product code is unchanged
**Project:** coolchan03/Atlas; base revision atlas-performance-20261010 (528dccee)
**Scope:** Android ARM64 text/GGUF inference, not image generation

## 1. Purpose and expected result

Atlas should install as ONE APK on a Motorola Razr Ultra 2025 (Qualcomm Adreno) and an onn Pro 13.2 tablet (MediaTek Mali), preserving local GGUF models and conversations.
On appropriate models, the phone should prefer a working Hexagon NPU, then an available Adreno OpenCL GPU, then CPU. The tablet should prefer an available Vulkan GPU, then CPU.
When a GPU can only handle part of a model, offload a configurable number of layers to that GPU and run the rest on the CPU.
OpenCL and Vulkan are packaged in the same APK but ordinarily only one GPU API handles a model at a time. There is no promise of using both GPU APIs simultaneously.
The app must show what backend truly loaded and how much acceleration occurred. A missing Vulkan binary must not be mislabeled as missing tablet GPU hardware.

## 2. Source-code findings and architectural constraint

The installed llama.rn dependency is 0.13.0-rc.4. Its Android RNLlama.java chooses one JNI library variant at process startup based on ARM CPU capabilities and Qualcomm/Adreno hints.
The existing Qualcomm-specific variant supports Hexagon/OpenCL when its required native pieces are present; non-Qualcomm devices ordinarily select CPU variants.
The vendor source list in cmake/rnllama-sources.cmake does not compile ggml-vulkan. The upstream llama.cpp project has Vulkan, but Atlas cannot use it merely by selecting GPU or increasing n_gpu_layers.
HardwareService.getOpenCLCapability currently checks getBackendDevicesInfo, which enumerates backends in the already-loaded JNI variant. Therefore no Vulkan entry is proof only of an absent runtime backend, not proof the hardware cannot use Vulkan.
The Atlas InferenceBackend enum currently permits CPU, OpenCL, HTP and Metal; new Vulkan support must extend all settings and routing code consistently.
The existing safe Android 8 GB GPU cap is 12 offloaded layers, and the existing Test model screen already measures model loading, generation and prefill.

## 3. Approach comparison and choice

**Chosen: keep llama.rn and add a maintained Vulkan-capable Android native variant**, packaged alongside the existing CPU and Qualcomm OpenCL/Hexagon variants. Preserve the JavaScript interface, streaming, tool compatibility, GGUF metadata and safety/fallback behavior.
**Rejected for this phase: replace llama.rn with an independent llama.cpp JNI service**. That duplicates context management and model streaming and makes integration risk much larger.
**Rejected: replace OpenCL with Vulkan everywhere.** That could regress the Razr Ultra; user explicitly requested support for both.
A combined OpenCL+Vulkan binary can be investigated after the separate-variant design works. It must not link to an OpenCL library required at load time on a Mali device that lacks it.

## 4. Native build architecture

Pin the llama.rn and vendored llama.cpp revisions together. Store repeatable patch files or a pinned native fork; do not patch temporary node_modules by hand as the release source.
Extend the native source list and native build system to register and compile ggml-vulkan, required SPIR-V shaders and Android Vulkan loader dependencies. Use the Android NDK and pinned shader-generation tools.
Create Vulkan-capable ARM64 shared-library and JSI/JNI wrapper variants with unique names and matching ABI. Retain CPU and existing Qualcomm OpenCL/Hexagon JNI variants.
Ensure the Mali Vulkan binary does not hard-link against an unavailable libOpenCL.so. Preserve CPU-only libraries for compatibility and recovery.
Before loading the single JSI library, select a suitable native variant via a safe Android Vulkan device probe, packaged-variant checks and ABI validation. Do not rely on the CPU manufacturer string alone.
Once a JSI variant is loaded into the Android process, do not hot-unload it. A user changing a setting that requires a different JNI variant must restart Atlas fully.
Within a variant exposing multiple physical backends, use native enumeration and exact backend device identifiers rather than guessed names.
Require CI checks of expected Vulkan artifacts, ELF dynamic dependencies, JNI exports, the correct ABI and native packaging. Do not accept an APK that silently omits the claimed Vulkan variant.

## 5. Backend selection and fallback

Add Automatic, OpenCL, Vulkan, CPU and compatible HTP selections to the backend domain and settings. Upgrade persisted legacy preferences without resetting conversations or imported models.
For each load, intersect (a) binary built-in support, (b) detected physical device, (c) model/quantization support, (d) memory budget, (e) crash history, and (f) user preference.
Razr default: eligible and actually enabled Hexagon -> OpenCL -> CPU. Vulkan on Adreno may be offered with a native-variant restart when available.
onn default: Vulkan -> CPU. Do not claim Mali OpenCL support without positive native runtime evidence.
Manual choices should report an unavailable backend reason and allow a safe CPU retry. Do not silently show OpenCL/Vulkan as active when CPU actually loaded.
For a failed GPU load: release incomplete contexts; if it was an ordinary resource shortage, make at most one conservative retry with fewer GPU layers; otherwise use CPU.
Do not repeat attempts on a known crashing driver. Backend switches requiring another JNI variant are deferred to a full application restart, not silently performed mid-inference.
Verify context.gpu, reasonNoGPU, actual device and native layer telemetry after each load. A selected backend or nonzero requested n_gpu_layers alone does not establish successful GPU offload.
Preserve existing JSI missing-bindings fast-fail, timeout, minimum-context CPU recovery and ability to unload. Never disguise a missing APK native library as a model-file problem.

## 6. Hybrid CPU and GPU offloading

Start safely on the approximately 8 GB onn tablet with no more than its current 12-layer GPU cap. Permit 0/4/8/12-layer tests with RAM guardrails, not a default 99-layer attempt.
Total memory includes model weights, CPU/GPU staging, KV cache and OS reserve. Keep CPU execution for all layers or operators the selected GPU cannot support.
Avoid enabling unsupported GPU KV cache, flash attention or context-shifting options. Keep hardware-specific inference settings separate per device.
Automatic tuning may save an optional, bounded local profile keyed by model identity, GPU and driver version, but should not synchronize it to another Android device.
Never pretend hybrid execution guarantees higher decode speed: moving layers between shared-memory CPU and GPU can cost time.

## 7. UI, diagnostics and benchmark

Use the existing Test model screen rather than a second benchmark system.
Show requested and actual backend; Vulkan/OpenCL device name; GPU offload layer count; fallback reason; model quantization; context length; prefill tok/s; decode tok/s; first-token time; and loaded memory estimate.
If Vulkan is absent from the APK, explicitly show Vulkan runtime not included in this build instead of GPU unavailable for this device.
For native-variant changes show Restart Atlas to activate the selected backend and persist the choice for next launch.
Benchmark identical prompts and GGUF files with CPU vs GPU/CPU hybrid using native timings. Include cold and warm runs plus several sustained runs to detect heat and memory regressions.
Show a result as unverified when native timing data or actual GPU offload counters are unavailable; do not substitute full generation wall time for native prefill speed.

## 8. Affected project modules

Native fork or patch: llama.rn Android CMake, vendor source list, Vulkan shader compilation, RNLlama.java loader, JNI/JSI backend registration and native packaging.
Atlas: src/types/index.ts; src/services/hardware.ts; src/utils/acceleration.ts; src/services/llm.ts; src/services/llmHelpers.ts; backend settings; src/screens/ModelTestScreen.tsx.
Tests: hardware probing, backend preference migration, model compatibility, fallback chain, native library selection, CPU+GPU offload, GPU status and speed metrics.
GitHub workflow: deterministic Android ARM64 build, pinned Vulkan shader deps, TypeScript, Jest, Kotlin/native compilation, APK content verification and failure diagnostics.
Do not modify image diffusion or BF16 fixes, encrypted chat sync, authentication changes or model files during this feature work.

## 9. Required test matrix

Test Qualcomm with HTP present, absent and crashing; Adreno OpenCL present, absent and crashing; Mali Vulkan present, absent and crashing; CPU-only device; low RAM; unsupported GGUF quantization; corrupted model; missing JSI bindings.
Test native-package probing before JSI load, selected variant reuse in a process, manual variant switch requiring restart, cache invalidation, and recovery when driver or required shared libraries fail to load.
Verify cases where requested GPU layers are positive but actual offloaded layers are zero; the UI must explicitly report CPU fallback.
Compile both JNI GPU variants with identical correct llama.rn/llama.cpp ABI and verify dependent Vulkan libraries in ARM64 release APK. Fail CI if Vulkan promised but not packaged.
Install the same APK on a Razr Ultra 2025 and onn Pro 13.2 for end-to-end GGUF Q4_K_M inference, no-conversion tests, speed comparison, sustained heat checks and memory stability.
A successful CI APK proves build/package integrity, not real-world GPU speed or driver support. On-device checks are mandatory before claiming that Mali Vulkan offloading works.

## 10. Acceptance and release gates

One installable APK packages Vulkan, OpenCL and CPU backends and retains existing NPU capabilities where truly available.
The onn tablet can try Vulkan and CPU/GPU hybrid offloading instead of being forced to CPU by Qualcomm-only native variant selection.
The Razr's existing OpenCL path and CPU fallback continue to function. Missing GPU drivers or unsupported operations never cause uncontrolled retry loops.
The UI distinguishes requested backend, native-available backend and actually offloaded model layers.
No model conversion, loss of chat data or cross-project regressions. Package and test failures block final release.
If the pinned native build cannot safely support both backends, document the exact native failure and do not ship an inert Vulkan toggle.
