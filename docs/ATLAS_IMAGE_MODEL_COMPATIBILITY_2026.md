# Atlas native image checkpoints: October 2026 compatibility

This is an experimental **Android ARM64** feature, not a device-certified release.
This checklist deliberately distinguishes "import recognized", "dependencies resolved",
"runtime compiled", and "image produced and visually inspected".

## Recommended checkpoint families

| Model | Style / role | Primary weight links | Support files | Atlas experimental engine |
| --- | --- | --- | --- | --- |
| Z-Image Base Q4_K_M | Photo realism and broadly creative art | https://huggingface.co/unsloth/Z-Image-GGUF/blob/main/z-image-Q4_K_M.gguf | Flux VAE + Qwen3-4B text encoder | Import, attach and inference routed; device validation pending |
| Anima Aesthetic v1.1 | Anime, manga and non-photorealistic illustration | https://huggingface.co/circlestone-labs/Anima/blob/main/split_files/diffusion_models/anima-aesthetic-v1.1.safetensors | Anima VAE + Qwen3-0.6B-Base text encoder | Import, attach and inference routed; device validation pending |
| Chroma1-HD Q4_K_M | Unrestricted mixed illustration / photos | https://huggingface.co/silveroxides/Chroma1-HD-GGUF | Flux VAE + T5XXL text encoder | Import, attach and inference routed; device validation pending |
| Pony Diffusion V7 Q4_0 | Western cartoons and character art | https://huggingface.co/purplesmartai/pony-v7-base/blob/main/gguf/base-v7-Q4_0.gguf | UMT5 encoder + VAE; AuraFlow backend required | **Not supported** by the current native backend; Atlas warns rather than loading as SDXL |

The large Kroma v0.3.1 and newer Qwen-Image 2.1 releases are interesting but
are not recommended as first phone downloads: their complete pipelines have
not been demonstrated within the Razr's available RAM and they do not yet
meet the same on-device test threshold. Larger or newer does not imply more
uncensored training or better character art.

## Exact official component sources

Z-Image: https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md
- VAE: https://huggingface.co/black-forest-labs/FLUX.1-schnell/tree/main
- Qwen3-4B encoder (GGUF quantized recommended on phones):
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF
- Base model: CFG 5; Turbo model: CFG 1 and about 8 diffusion steps.

Anima: https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/anima.md
- VAE and text-encoder: https://huggingface.co/circlestone-labs/Anima/tree/main/split_files
- Qwen3-0.6B-Base GGUF (optional compact alternative):
  https://huggingface.co/mradermacher/Qwen3-0.6B-Base-GGUF
- Aesthetic: Euler sampler, CFG about 6. Turbo variants need lower guidance.

Chroma: https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/chroma.md
- VAE: https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/ae.safetensors
- T5XXL: https://huggingface.co/comfyanonymous/flux_text_encoders
- Euler, CFG about 4, and model setting chroma_use_dit_mask=false.
- A quantized T5 is usually more practical than an fp16 T5 on a phone.

Pony V7: https://huggingface.co/purplesmartai/pony-v7-base
- AuraFlow and UMT5 are NOT equivalent to FLUX, SDXL, or Qwen3.
- Atlas currently marks Pony as unsupported instead of silently misclassifying it.

## Importing and testing in Atlas

1. Download an appropriate checkpoint. In My models, import it as a native
   image model. Original safetensors or diffusion GGUF is preserved.
2. Open the imported model and use Attach support file for VAE, T5XXL,
   CLIP-L or **Qwen3 / LLM** according to its architecture.
3. Missing required support files are shown before image generation starts.
   Encoders are **not** interchangeable: Anima needs Qwen3-0.6B-Base and
   Z-Image needs the Qwen3-4B encoder.
4. Open Test: the quick test is for engine smoke checks only; use the quality
   test for image quality. Both use seed 42, fixed prompt, independent progress,
   and allow cancel. LoRAs and the ESRGAN upscaler are off by default.
5. Review output manually. A PNG of the wrong subject must be marked failed.
   Until a real device generates the expected image, compatibility is provisional.

## Important limitations

- The experimental native build now enables Vulkan and attempts to run
  diffusion on vulkan0 with the text encoder and VAE on CPU. Its 4 GiB
  GPU budget is a conservative starting value. Runtime detection must
  succeed before GPU acceleration can be claimed.
- If the Vulkan GPU is missing, Atlas reports CPU fallback instead of
  claiming GPU acceleration. A Vulkan runtime failure surfaces an error.
- On supported Vulkan hardware, speed and thermals remain UNVERIFIED
  until tested on the real Razr Ultra 2025.
- The image Test page offers a 1-step smoke test and shows native backend,
  stage, last output time, CPU heartbeat and diffusion steps; a 1-step PNG
  verifies execution, NOT prompt adherence.
- Text encoders, VAE and diffusion require memory beyond the checkpoint;
  shared Android GPU memory is not dedicated VRAM.
- The 16 GB phone RAM figure is total RAM, not free RAM. Account for Android,
  encoder/transformer working buffers, VAE and output resolution.
- Model-family recognition is based on known names and GGUF architecture / tensor
  signatures; recognition is *not* proof of weight integrity or inference quality.
- No model is guaranteed to comply with every NSFW or SFW prompt; assess
  published training descriptions and licenses, not "uncensored" marketing alone.
- The Pony license, Anima non-commercial model license, and Krea/Kroma
  derivatives have distinct distribution and commercial-use restrictions.
- Atlas's experiment must not be released as device-certified until one each
  of Z-Image, Anima and Chroma completes import, attach, render, cancel, retry
  and visual prompt-check on physical hardware without memory crashes.
