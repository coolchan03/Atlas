# Atlas Optional llama.kt Vulkan Engine Design

**Date:** 2026-10-10  
**Status:** Architecture design for user review; no engine integration merged  
**Project:** coolchan03/Atlas  
**Base:** atlas-performance-20261010 at 528dccee  
**Supersedes for Vulkan implementation:** the native-variant strategy in docs/superpowers/specs/2026-10-10-atlas-dual-gpu-backends-design.md

## Objective
Ship one Android ARM64 Atlas APK with its current llama.rn inference engine preserved and a separate optional llama.kt Vulkan engine for Mali devices such as the onn Pro 13.2. Keep existing models, chats, CPU and Adreno OpenCL behavior. Allow partial model-layer GPU offload and CPU execution for remaining layers/operators. Report actual GPU usage, not just requested settings.

## Verified external reference
Source: https://github.com/hokanosekai/llama.kt, revision cad0ec95620d0dd951fc277fec0223f9ea4171e4.
llama.kt is Apache-2.0 and includes a pinned older llama.rn glue layer and bundled llama.cpp derived from llama.rn 0.12.6; Atlas uses llama.rn 0.13.0-rc.4. Its native source includes ggml-vulkan, OpenCL and JNI. It exposes Kotlin LlamaEngine.availableBackends, load, formatChat, completion, interrupt, free, and activeBackend.
The author reports Vulkan working on Mali-G68, not specifically the onn tablet's Mali GPU. Actual tablet compatibility and token-rate improvements must be tested. The existing Atlas app React Native APIs must not load old-ABI binary components as if they were newer llama.rn libraries.

## Alternatives
1. **Selected:** Vendor llama.kt as a separate Apache-licensed Android library/engine and expose it to Atlas via a narrow React Native module. Keeps native ABI and model contexts separate. Increases APK size but isolates regressions.
2. Patch Atlas's current llama.rn vendor with Vulkan sources. Smaller operational abstraction but high native ABI integration and backend-loader risk.
3. Replace all Atlas llama.rn calls with llama.kt. Rejected: threatens multimodal, tool calls, JSI streaming and existing chat features.

## Components and interfaces
- **Pinned dependency:** Obtain source at a fixed commit, preserve Apache-2.0 license and upstream MIT license notices; keep its Vulkan patches, build recipe and sources together. Do not copy binaries from an unrelated upstream revision.
- **Android library:** Compile llama.kt as an ARM64 native module compatible with Atlas's Android Gradle and Kotlin toolchain. Use unique native names; load both libraries in one process without collisions. Before promising coexistence, verify ELF exported symbols, duplicate ggml symbols, JNI registrations and load-order behavior. If conflict exists, require a stable static namespaced build or separate Android process; never bypass with a risky System.loadLibrary trick.
- **Bridge:** Add AtlasVulkanModule and AtlasVulkanPackage in the Android app. Commands: listBackends(), loadModel(path, gpuLayers, ctx, threads), formatChat(messages), startCompletion(prompt, sampling), interrupt(), unload(), activeBackend(). Stream completion events by session ID, preserving cancellation and cleanup. No raw model buffers or chat databases cross the module boundary.
- **JS adapter:** Implement a typed optional engine adapter that matches the subset of Atlas's inference operations necessary for text chat. Do not redirect vision, audio, tools or other unsupported features to Vulkan. Continue to use llama.rn for those operations.
- **Selection:** Existing CPU/OpenCL/HTP route is unchanged unless user enables experimental Vulkan or a verified runtime probe confirms it. A detected Vulkan GPU and successful model offload are separate conditions. On Mali, select conservative offload and do not assume partial is faster than full CPU.
- **Fallback:** Vulkan load, unsupported quantization, out-of-memory or driver errors release the Vulkan context and fall back to the current llama.rn CPU route without deleting or altering a model. Bound retries; avoid repeated unsafe attempts following a driver error.

## Android build and packaging
Include library Gradle integration in a separate experimental branch; pinned NDK, Vulkan headers and SPIR-V generation. Confirm relevant Vulkan libs and shaders are actually included in the APK. Preserve current arm64 CPU and Qualcomm OpenCL/Hexagon libraries and native-image diffusion dependencies. Implement CI checks for Vulkan symbols, JNI visibility, duplicate symbol collisions, 16KB alignment, no unintended network code, and actual library loading where emulator/native validation supports it.
No runtime download of proprietary device drivers. GPU support means the system's driver can enumerate Vulkan 1.2-compatible devices.

## Data, safety and performance
Use the same on-device GGUF file path; do not copy model weights into the application APK or convert formats. Preserve model identity and chat history even if switching backends. Only one model session active per selected engine; strictly release native context on switch and cancel active streams.
On approximately 8GB RAM tablet begin with 0, 4, 8 and 12 GPU layer benchmark candidates, subject to available-memory limits. Measure native prefill tok/s, decode tok/s, first-token latency, load time, memory pressure and sustained thermal behavior. Compare with same model and prompt on CPU; choose Vulkan only if it is stable and faster for that model/device. Avoid optimizing on one short measurement.
UI shows experimental Vulkan availability, physical GPU/device name, requested/offloaded layers, active engine, and concrete fallback reason. If Vulkan is not packaged: "Vulkan runtime missing from this build", not "tablet GPU unavailable".

## Test and release gates
1. Verify exact pinned source, license, native symbols and reproducible build. Fail test if absent.
2. Compile ARM64 llama.kt standalone against pinned source on Android CI.
3. Compile alongside Atlas's current llama.rn libraries and native image libraries and check no binary conflicts.
4. Test JS<->Kotlin command and streaming/cancellation adapter with unit and instrumentation tests; tests for start/stop, unload, bad model, low memory, driver unavailable, fallback and wrong native backend.
5. Run existing Atlas Jest and TypeScript checks, Kotlin compilation, and release APK verification; do not disregard unrelated preexisting warnings.
6. Install the same experimental APK on onn Pro 13.2 and Motorola Razr Ultra; confirm actual Mali and Adreno backend, Q4_K_M model compatibility, GPU layer offloading, stable replies and compare CPU vs Vulkan tokens/sec.
7. Only publish a labeled experimental build after CI passes. Device validation is necessary before calling this a working Mali performance fix.

## Boundaries and non-goals
No changes to image model backends, unrelated security work, encrypted chat sync, package naming, model quantization, or current released APK until native compatibility is demonstrated.
Existing production llama.rn path remains the default and is untouched by the experimental integration.

