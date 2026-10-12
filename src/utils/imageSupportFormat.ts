/** Validate support-file format before passing it to the native image engine. */
export type ImageSupportFileKind = 'vae' | 'llm' | 'clip_l' | 't5xxl' | 'lora' | 'upscaler';

export function validateImageSupportFormat(name: string, kind: ImageSupportFileKind): string | null {
  const filename = name.trim().toLowerCase();
  if (!filename || filename === '.' || filename === '..' ||
      filename.includes('/') || filename.includes('\\') || filename.includes('\0') ||
      filename.length > 255) return 'Invalid support-file name.';
  const extension = filename.split('.').pop() || '';
  if (!['safetensors', 'safetensor', 'gguf', 'pth', 'pt'].includes(extension)) {
    return 'Supported file types: .safetensors, .gguf, .pth and .pt.';
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
