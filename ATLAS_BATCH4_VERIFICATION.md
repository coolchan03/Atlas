# Atlas Batch 4: image and model integration checklist

## Source checkpoints completed
- Support attachment formats validated before native handoff (commit 113f38e).
- Direct image imports reject invalid result metadata and unsupported architectures (commit 01c6321).
- Image download recovery failures log diagnostic errors while keeping retry metadata (commit 9b430e4).

## Pending hardware/build verification (release blockers)
- Confirm current experimental APK builds and packages llama.kt Vulkan, stable-diffusion Vulkan CLI, and its native dependencies.
- On Razr Ultra 2025 (Adreno 830), test model probe, model load, first diffusion step, 10-step image generation and preview/progress reporting for Anima 1.1 and another independently supported checkpoint.
- Test OpenCL and Vulkan backend selection. Preserve strict explicit GPU choice; Auto may fall back only when its selected engine supports CPU.
- Confirm original .gguf/.safetensors model import works from Android document provider without conversion code 134; test low-storage, invalid model, and interrupted copy paths.
- Attach and load compatible VAE, encoder, LoRA, and ESRGAN upscaler; verify actual output changes rather than relying only on UI registration.
- Test download resume/retry after app force stop, device reboot, low storage and interrupted extraction.
- Ensure 5-6 GB checkpoints are never assumed compatible solely from extension or filename.
- Keep an actionable test report with model file, family, backend, precision, native error, stage and elapsed time.

Status: Batch 4 source-hardening checkpoints committed. Hardware/native integration remains unverified; do not mark full model compatibility complete until the above scenarios pass.
