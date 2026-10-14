import { validateImageSupportFormat, imageJsonConfigHint, ATLAS_NATIVE_IMAGE_CONFIG_SAMPLE } from '../../../src/utils/imageSupportFormat';
describe('image configuration descriptions', () => {
  it('describes tokenizer and scheduler JSON without promising unsupported runtime features', () => {
    expect(imageJsonConfigHint('tokenizer.json')).toMatch(/GGUF/);
    expect(imageJsonConfigHint('scheduler_config.json')).toMatch(/scheduler/i);
    expect(imageJsonConfigHint('model_index.json')).toMatch(/Diffusers/);
    expect(imageJsonConfigHint('my-other.json')).toMatch(/metadata/i);
    expect(imageJsonConfigHint('weights.safetensors')).toBe('');
    expect(imageJsonConfigHint('atlas-runtime.json')).toMatch(/Active native settings/);
    expect(JSON.parse(ATLAS_NATIVE_IMAGE_CONFIG_SAMPLE)).toEqual({
      schema: 'atlas-native-image/v1', sampling_method: 'euler', schedule: 'discrete',
    });
  });
});

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
  it('accepts JSON configuration files but not JSON as model weights', () => {
    expect(validateImageSupportFormat('tokenizer.json', 'config')).toBeNull();
    expect(validateImageSupportFormat('scheduler_config.json', 'config')).toBeNull();
    expect(validateImageSupportFormat('tokenizer.json', 'lora')).toMatch(/Supported file types/);
    expect(validateImageSupportFormat('weights.safetensors', 'config')).toMatch(/must be .json/);
    expect(validateImageSupportFormat('../../config.json', 'config')).toMatch(/Invalid/);
  });
  it('rejects ambiguous upscalers and malicious filenames', () => {
    expect(validateImageSupportFormat('other.pth', 'upscaler')).toMatch(/Unknown/);
    expect(validateImageSupportFormat('../evil.safetensors', 'lora')).toMatch(/Invalid/);
    expect(validateImageSupportFormat('x.bin', 'vae')).toMatch(/Supported/);
  });
});
