import { getMissingImageSupport, getRequiredImageSupport, isRunnableNativeModel } from '../../../src/utils/nativeImageCompatibility';

describe('native image family support checks', () => {
  it('requires Z-Image and Anima to have a VAE and Qwen LLM encoder', () => {
    const model = { nativeImageFamily: 'z_image' as const };
    expect(getRequiredImageSupport(model)).toEqual(['vae', 'llm']);
    expect(getRequiredImageSupport({ nativeImageFamily: 'anima' })).toEqual(['vae', 'llm']);
    expect(getMissingImageSupport({ ...model, supportFiles: [] })).toEqual(['vae', 'llm']);
  });
  it('ignores disabled attachments and prevents missing Chroma T5', () => {
    const model = { nativeImageFamily: 'chroma' as const,
      supportFiles: [{kind: 'vae' as const, name: 'ae.safetensors', path: '/tmp/ae', size: 1,
        strength: 0.75, enabled: true},
      {kind: 't5xxl' as const, name: 't5.gguf', path: '/tmp/t5', size: 1,
        strength: 0.75, enabled: false}] };
    expect(getMissingImageSupport(model)).toEqual(['t5xxl']);
    expect(getMissingImageSupport({ ...model, supportFiles: model.supportFiles.map(f => ({...f,enabled:true})) }))
      .toEqual([]);
  });
  it('does not falsely label AuraFlow as runnable or reject precompiled MNN', () => {
    expect(isRunnableNativeModel({backend: 'sdcpp', nativeImageFamily: 'auraflow'})).toBe(false);
    expect(isRunnableNativeModel({backend: 'mnn', nativeImageFamily: 'unknown'})).toBe(true);
    expect(isRunnableNativeModel({backend: 'sdcpp', nativeImageFamily: 'z_image'})).toBe(true);
  });
});
