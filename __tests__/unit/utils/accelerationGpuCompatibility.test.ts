import { automaticBackendForModel } from '../../../src/utils/acceleration';
import { INFERENCE_BACKENDS } from '../../../src/types';

describe('device-aware accelerator selection', () => {
  const both = { hasNpu: true, hasGpu: true };
  it('uses GPU for Q4_K_M when NPU cannot use its quantization', () => {
    expect(automaticBackendForModel(both, 'Qwen3.5-4B', 'Q4_K_M')).toBe(INFERENCE_BACKENDS.OPENCL);
  });
  it('keeps K-quant on CPU if no GPU is available', () => {
    expect(automaticBackendForModel({ hasNpu: true, hasGpu: false }, 'Qwen3.5-4B', 'Q4_K_M')).toBe(INFERENCE_BACKENDS.CPU);
  });
  it('prefers NPU for an eligible Llama-family Q4_0 model', () => {
    expect(automaticBackendForModel(both, 'Llama-3-8B', 'Q4_0')).toBe(INFERENCE_BACKENDS.HTP);
  });
});
