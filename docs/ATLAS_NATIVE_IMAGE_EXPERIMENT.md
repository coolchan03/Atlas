# Atlas native image models - experimental

Branch: atlas-image-native. The published atlas-voice release remains unchanged.

## Goal

Use image safetensors and diffusion GGUF weights directly on Android.
No conversion to MNN or QNN is required for the native image backend.
The existing optimized MNN/QNN ZIP model catalog is retained.

## Usage

1. My models -> Import from device -> select an image checkpoint.
2. Safetensors checkpoint headers are inspected for SD1.x, SDXL, FLUX,
   or LoRA tensor names. A LoRA is not a standalone image generator.
3. GGUF files use the general.architecture metadata field; do not route
   all GGUF into the language-model importer.
4. My models -> image model -> Attach LoRA / support file.
5. LoRA strength, enabled/disabled, and remove controls are per model.
6. FLUX standalone transformer GGUF also needs VAE, CLIP-L, and T5XXL
   files from its matching model configuration.
7. PTH/PT support is for compatible ESRGAN upscalers only - not arbitrary
   legacy Python-style checkpoint files.

## Runtime limits

- Android ARM64 stable-diffusion.cpp CPU-only executable is built via
  the experimental GitHub Actions workflow.
- Large SDXL/FLUX models can be extremely slow or exceed phone RAM.
- Import success does not guarantee successful inference.
- Some LoRA naming conventions are not compatible with this engine.
- Safetensors tensor offsets and actual byte counts are checked.
- Original model files are retained; conversion is not performed.
- MNN/QNN downloaded ZIPs use a different engine and do not have
  native support for arbitrary add-on LoRAs.

## On-device tests still required

- Import complete and truncated SDXL safetensors files.
- Verify image GGUF vs text GGUF classification and import.
- Attach LoRA to an SDXL checkpoint, toggle it, adjust strength.
- Generate using FLUX GGUF with VAE, CLIP-L, T5XXL attached.
- Run ESRGAN PTH upscaling as a second step.
- Download DreamShaper V8 MNN and chipset-compatible QNN ZIPs.
- Check download sizes, extraction, ready marker and generation.
- Check WorkManager retries and resumes large ZIPs after a stalled network connection,
  read timeout, and temporary HTTP 429/5xx response (maximum three retries).
- All Android model ZIP flows now use a streaming native extractor with ZIP path
  validation instead of relying entirely on the JavaScript ZIP bridge.
- Confirm existing text-GGUF/mmproj and MNN/QNN paths still work.

## Attribution

The native diffusion executable is built from stable-diffusion.cpp
by leejet (MIT license) with its upstream third-party dependencies.
See https://github.com/leejet/stable-diffusion.cpp for source.
