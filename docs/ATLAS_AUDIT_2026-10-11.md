# Atlas code audit — 2026-10-11

Scope: coolchan03/Atlas, experimental branch atlas-vulkan-integration-20261011, revision 7b108f4. Focus on compatibility with Motorola Razr Ultra 2025 (Adreno), onn Pro 13.2 (Mali), GGUF model imports, Vulkan/OpenCL/CPU fallback, native image features, and application stability.

## Verification performed
- GitHub CI build 38143248635: SUCCESS. This workflow built and verified the standalone Vulkan native Android AAR; it did not build the full Atlas application or run device inference.
- Native source contract: PASS.
- Vulkan bridge source contracts: PASS.
- Gradle build-wiring source contract: PASS.
- Latest app-bridge CI: 38145296151, in progress at the time of audit; native standalone compilation is not a full app Kotlin compile.
- Full TypeScript/Jest/ESLint/Android app tests: NOT RUN in the isolated Windows checkout because node_modules are absent, and local Android SDK is absent.
- Device tests on Motorola Razr Ultra and onn Pro 13.2: NOT RUN.

## Findings

### Critical — Vulkan is not connected to Atlas's chat model service
No src/ TypeScript or TSX file refers to AtlasVulkan or vulkanEngine. The Android React Native module is registered, but no JS adapter calls it; selecting a model or sending a chat remains on existing llama.rn. Native compilation alone cannot satisfy the requirement for Mali GPU support. Action: implement a typed adapter and explicit opt-in route with CPU rollback.

### Important — No full Atlas APK compile gate
The experimental workflow runs :atlasLlamaKt:assembleRelease only, not :app:assembleDebug or :app:assembleRelease with atlasVulkanEnabled=true. The newly added MainApplication and AtlasVulkanModule files are therefore not compiled in that workflow. Action: add full-app Gradle compile, native packaging checks, and React Native tests before distributing an APK.

### Important — GPU offload not established by backend label
The new loadModel() accepts gpuLayers, then returns activeBackend(), without verifying physical GPU selection or number of layers truly offloaded. Backend labels are insufficient; report actual offload telemetry or unknown and distinguish CPU fallback.

### Important — Cancellation can miss queued requests
generate() schedules a blocking completion on a single executor and assigns sessionId inside that task, so an immediate interrupt() before execution may not see its id. Queued requests are not cancelled, and multiple generate calls can overwrite sessionId. Action: synchronize a generation state machine, reject busy sessions, and cancel pending tasks by id.

### Important — Native generation isn't surfaced to chat
The bridge sends AtlasVulkanToken/AtlasVulkanEnd/AtlasVulkanError, but no JS listeners exist in src. Streaming is implemented at the native boundary only.

### Important — Reflection across untyped classes needs integration tests
The bridge reflectively creates LlamaEngine and SamplingParams, dynamically looks up methods by name/parameter count, uses a Proxy TokenCallback, and assumes classes and constructors survive release shrinking. Add debug/release instrumentation tests for missing native package, model loading, streaming, cancellation, cleanup and R8/minification. Consider a typed compile-time bridge under the experimental Gradle property to simplify this long-term.

### Moderate — Existing CPU/OpenCL model path must be regression-tested
The opt-in dependency is guarded by atlasVulkanEnabled. This is appropriate isolation but does not prove Adreno OpenCL and CPU fallback will work in an APK containing both libraries. Require same-APK smoke tests on both devices, especially ELF load order and process-memory limits.

### Moderate — Existing image GPU and safetensors paths are separate
Stable diffusion Vulkan and text llama.kt Vulkan are separate inference stacks. Passing the text AAR workflow says nothing about safetensors ingestion, LoRA/style support files, BF16 shaders or image generation on Adreno. They need independent tests and are not covered by this branch.

### Moderate — Source-contract tests are shallow
Existing scripts assert strings in files; they do not instantiate Kotlin bridge or run model inference, and cannot establish driver behavior or correctness. Expand with Java/Kotlin tests and CI app compilation before marking integration complete.

## Recommended repair order
1. Add an app compilation gate to CI, preserving the standalone AAR test and existing production workflows.
2. Replace fragile reflection with strongly typed optional library integration where possible, or validate the current reflection contract under release shrinker.
3. Add JS engine adapter, error handling, event subscriptions and session ID filtering.
4. Fix generation lifecycle and interrupt races with reproducing tests.
5. Wire optional text-only model selection and bounded CPU fallback.
6. Validate actual offload and speed diagnostics on both phones/tablets.
7. Run full npm/Jest/TypeScript/Android tests and separate image model regressions.

## Release decision
NOT READY to be advertised as dual-GPU Atlas APK. Standalone native Vulkan AAR build passed, but application integration and physical acceleration remain unverified. The production branch is not modified by this audit.
