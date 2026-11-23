import { capabilitiesFor } from '../../../src/services/buildCapabilities';

const ARM64 = ['libatlas_sdcli.so', 'libatlas_sdcli_opencl.so', 'libllamakt.so', 'liblitertlm_jni.so', 'libonnxruntime.so', 'libsherpa-onnx-jni.so', 'librnllama.so', 'librnllama_v8.so',
  'librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so', 'librnwhisper.so', 'libstable_diffusion_core.so'];
const X86_64 = ['libonnxruntime.so', 'libsherpa-onnx-jni.so', 'librnllama.so', 'librnllama_x86_64.so', 'librnwhisper.so'];
const ARM32 = ['libonnxruntime.so', 'libsherpa-onnx-jni.so', 'librnwhisper.so'];
const X86 = ['libonnxruntime.so', 'libsherpa-onnx-jni.so'];
const missing = (abi: string, libs: string[]) => capabilitiesFor({ abi, nativeLibs: libs }).features.filter((f) => !f.available).map((f) => f.id);

describe('what each build of Atlas has', () => {
  it('64-bit ARM has everything', () => { expect(missing('arm64-v8a', ARM64)).toEqual([]); });

  it('x86_64 has the on-device engine on the CPU, voices and transcription, and no accelerators, image generation or LiteRT', () => {
    expect(missing('x86_64', X86_64)).toEqual(['npu', 'openclText', 'vulkanText', 'imageGeneration', 'liteRt']);
  });

  it('32-bit ARM has no on-device AI at all, but still has voices and offline transcription', () => {
    expect(missing('armeabi-v7a', ARM32)).toEqual(['localAi', 'npu', 'openclText', 'vulkanText', 'imageGeneration', 'liteRt']);
  });

  it('32-bit x86 also lacks offline transcription', () => {
    expect(missing('x86', X86)).toEqual(['localAi', 'npu', 'openclText', 'vulkanText', 'imageGeneration', 'liteRt', 'whisper']);
  });

  it('says why each missing feature is missing and names the CPU type', () => {
    const caps = capabilitiesFor({ abi: 'armeabi-v7a', nativeLibs: ARM32 });
    expect(caps.abiName).toBe('32-bit ARM');
    expect(caps.features.find((f) => f.id === 'localAi')?.missing).toMatch(/64-bit ARM version/);
    expect(caps.features.find((f) => f.id === 'whisper')?.missing).toBe('');
  });

  it('marks nothing missing when the library list cannot be read (an iOS build, an old build)', () => {
    for (const info of [null, { abi: 'arm64', nativeLibs: [] }]) {
      const caps = capabilitiesFor(info);
      expect(caps.unknown).toBe(true);
      expect(caps.features.every((f) => f.available)).toBe(true);
    }
  });
});
