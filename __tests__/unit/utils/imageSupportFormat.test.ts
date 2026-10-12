import { validateImageSupportFormat } from '../../../src/utils/imageSupportFormat';
describe('native image support attachment formats', () => {
  it('accepts recognized LoRA, encoder and VAE weights', () => {
    expect(validateImageSupportFormat('portrait_lora.safetensors', 'lora')).toBeNull();
    expect(validateImageSupportFormat('qwen_3_06b.gguf', 'llm')).toBeNull();
    expect(validateImageSupportFormat('qwen_vae.safetensors', 'vae')).toBeNull();
  });
  it('accepts ESRGAN PyTorch upscalers', () => {
    expect(validateImageSupportFormat('RealESRGAN_x4plus.pth', 'upscaler')).toBeNull();
  });
  it('rejects PyTorch weight files as LoRA or prompt encoders', () => {
    expect(validateImageSupportFormat('adapter.pth', 'lora')).toMatch(/PyTorch/);
    expect(validateImageSupportFormat('encoder.pt', 'llm')).toMatch(/PyTorch/);
  });
  it('rejects incompatible GGUF LoRAs and upscalers', () => {
    expect(validateImageSupportFormat('adapter.gguf', 'lora')).toMatch(/GGUF/);
    expect(validateImageSupportFormat('upscaler.gguf', 'upscaler')).toMatch(/GGUF/);
  });
  it('rejects ambiguous upscalers and malicious filenames', () => {
    expect(validateImageSupportFormat('other.pth', 'upscaler')).toMatch(/Unknown/);
    expect(validateImageSupportFormat('../evil.safetensors', 'lora')).toMatch(/Invalid/);
    expect(validateImageSupportFormat('x.bin', 'vae')).toMatch(/Supported/);
  });
});
