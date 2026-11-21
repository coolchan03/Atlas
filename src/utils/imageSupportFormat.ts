/* eslint-disable complexity -- Explicit safety/extension whitelist checks are intentionally kept together. */
/** Validate support-file format before passing it to the native image engine. */
export const ATLAS_NATIVE_IMAGE_CONFIG_SAMPLE = JSON.stringify({
  schema: 'atlas-native-image/v1',
  sampling_method: 'euler',
  schedule: 'discrete',
}, null, 2);

/** Describe what a JSON file contributes without implying it can execute model weights. */
export function imageJsonConfigHint(name: string): string {
  if (!/\.json$/i.test(name)) return '';
  const filename = name.toLowerCase();
  if (filename === 'atlas-runtime.json') {
    return 'Active native settings: sampling_method (euler, euler_a, heun, dpm2, dpm++2m, dpm++2mv2, dpm++2s_a, lcm) and schedule (discrete, karras, ays). Invalid fields are rejected.';
  }
  if (/tokenizer|vocab|added_tokens|special_tokens/.test(filename)) {
    return 'Tokenizer metadata saved with this model. The native image engine uses tokenizers included in compatible GGUF encoders; this file alone does not enable a new tokenizer or architecture.';
  }
  if (/scheduler/.test(filename)) {
    return 'Scheduler configuration saved for compatibility. The native diffusion engine selects its own supported sampler; this JSON does not override it.';
  }
  if (/model_index|pipeline/.test(filename)) {
    return 'Diffusers pipeline metadata saved. Atlas does not execute Python Diffusers pipelines from JSON; compatible image weights and encoders are still required.';
  }
  return 'JSON model configuration saved as metadata. Only settings supported by the selected native engine can affect generation.';
}

export type ImageSupportFileKind = 'vae' | 'llm' | 'clip_l' | 't5xxl' | 'lora' | 'upscaler' | 'config';

export function validateImageSupportFormat(name: string, kind: ImageSupportFileKind): string | null {
  const filename = name.trim().toLowerCase();
  if (!filename || filename === '.' || filename === '..' ||
      filename.includes('/') || filename.includes('\\') || filename.includes('\0') ||
      filename.length > 255) return 'Invalid support-file name.';
  const extension = filename.split('.').pop() || '';
  if (kind === 'config') return extension === 'json' ? null : 'Configuration attachments must be .json files.';
  if (!['safetensors', 'safetensor', 'gguf', 'pth', 'pt'].includes(extension)) {
    return 'Supported file types: .safetensors, .gguf, .pth, .pt and .json (configuration).';
  }
  if (extension === 'pth' || extension === 'pt') {
    if (kind !== 'upscaler') return 'PyTorch .pth/.pt files cannot be loaded as a LoRA, VAE or text encoder.';
    if (!/(esrgan|realesrgan|upscal)/i.test(filename)) {
      return 'Unknown PyTorch upscaler. Select a compatible ESRGAN checkpoint with a recognizable filename.';
    }
  }
  if (extension === 'gguf' && kind === 'upscaler') {
    return 'GGUF upscalers are not supported by this image runtime.';
  }
  if (extension === 'gguf' && kind === 'lora') {
    return 'GGUF style LoRAs are not supported by this image runtime; use compatible safetensors weights.';
  }
  if ((extension === 'safetensors' || extension === 'safetensor') && kind === 'upscaler') {
    return 'This upscaler path accepts compatible ESRGAN .pth/.pt weights, not arbitrary safetensors.';
  }
  return null;
}
