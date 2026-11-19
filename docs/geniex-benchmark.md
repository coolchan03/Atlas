# GenieX benchmark protocol

A decision tool, not an integration. GenieX would be adopted only if it beats the current engine on the same phone, with nothing lost.

Scope: Snapdragon text and vision-language models only. It is NOT assumed to accelerate diffusion image generation (QNN/Vulkan/OpenCL image engines are separate and stay as they are).

For each supported phone (for example Motorola Razr Ultra 2025) and each model + quantization to test (include a Q4_0 model, a vision model with its projector, and an MTP-capable model):
1. Same model file, same quantization, same context length, same 5 prompts (short, 500-token, 2,000-token, tool-call request, image question), same output length.
2. For each engine (current llama.rn on its best backend, and GenieX): cold load seconds, first-token seconds when warm, prefill and decode tokens per second, peak RAM, and whether vision, tools and MTP work. At least 5 replies each, phone cool and plugged in or at the same battery level.
3. Record the licence terms of the engine and of any converted model files, and an estimate of the days needed to integrate.
4. Enter the numbers into `compareEngines` (`src/services/engineBenchmark.ts`). It answers `replace`, `keep`, `not-comparable` or `need-more-runs`, with the reasons.

Never replace the current engine from one sample, a different quantization, a phone the candidate does not support, or a result that drops vision, tools, MTP or Q4_0.
