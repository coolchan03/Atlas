import { loadFallbackNotes } from '../../../src/services/fallbackNotes';

const base = { requestedContext: 8192, actualContext: 8192, gpuAttemptFailed: false, backend: 'opencl', requestedGpuLayers: 99, attemptedGpuLayers: 99 };

describe('what a load gave up, in plain words', () => {
  it('says nothing when the load went as asked', () => {
    expect(loadFallbackNotes(base)).toEqual([]);
  });

  it('says the context was reduced, with both numbers and what helps', () => {
    const [note] = loadFallbackNotes({ ...base, actualContext: 4096 });
    expect(note).toContain('reduced from 8192 to 4096 tokens');
    expect(note).toContain('smaller model');
  });

  it('says the accelerator could not start the model and it runs on the CPU, naming the accelerator', () => {
    expect(loadFallbackNotes({ ...base, gpuAttemptFailed: true, backend: 'htp' })).toEqual(['The NPU could not start this model, so it runs on the CPU, which is slower.']);
    expect(loadFallbackNotes({ ...base, gpuAttemptFailed: true })[0]).toMatch(/^The GPU \(OpenCL\) could not start/);
  });

  it('does not blame an accelerator when the CPU was asked for', () => {
    expect(loadFallbackNotes({ ...base, backend: 'cpu', gpuAttemptFailed: true, requestedGpuLayers: 0, attemptedGpuLayers: 0 })).toEqual([]);
  });

  it('says how many layers fit on the accelerator when only some did', () => {
    expect(loadFallbackNotes({ ...base, requestedGpuLayers: 99, attemptedGpuLayers: 20 })).toEqual(['Only 20 of 99 layers run on the accelerator, because the rest did not fit in memory.']);
  });

  it('can report several at once', () => {
    expect(loadFallbackNotes({ ...base, actualContext: 2048, gpuAttemptFailed: true })).toHaveLength(2);
  });
});
