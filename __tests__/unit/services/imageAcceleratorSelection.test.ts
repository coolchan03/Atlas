import { imageComputeMode, selectImageAccelerator } from '../../../src/services/imageAcceleratorSelection';

const probes = () => ({
  vulkan: jest.fn(async () => ({ enumerated: true, detail: 'vulkan0' })),
  opencl: jest.fn(async () => ({ supported: true })),
  npu: jest.fn(async () => true),
});
describe('image runtime accelerator selection', () => {
  it('defaults to Auto and respects a migrated manual CPU setting', () => {
    expect(imageComputeMode({ imageUseOpenCL: true })).toBe('auto');
    expect(imageComputeMode({ imageUseOpenCL: false })).toBe('cpu');
    expect(imageComputeMode({ imageBackendMode: 'gpu', imageUseOpenCL: false })).toBe('gpu');
  });
  it('selects Vulkan only for native imported checkpoints', async () => {
    const probe = probes();
    expect((await selectImageAccelerator('sdcpp', 'auto', probe)).selected).toBe('vulkan');
    expect(probe.opencl).not.toHaveBeenCalled();
  });
  it('does not silently substitute OpenCL for an unavailable diffusion GPU', async () => {
    const probe = probes();
    probe.vulkan.mockResolvedValue({ enumerated: false, detail: 'no supported GPU' });
    await expect(selectImageAccelerator('sdcpp', 'auto', probe))
      .rejects.toThrow('CPU was not chosen automatically');
    expect(probe.opencl).not.toHaveBeenCalled();
  });
  it('requires native OpenCL for MNN models in Auto', async () => {
    const probe = probes();
    expect((await selectImageAccelerator('mnn', 'auto', probe)).selected).toBe('opencl');
    probe.opencl.mockResolvedValue({ supported: false });
    await expect(selectImageAccelerator('mnn', 'auto', probe)).rejects.toThrow('OpenCL not detected');
  });
  it('honors manual CPU only with an eligible image runtime', async () => {
    const probe = probes();
    expect((await selectImageAccelerator('sdcpp', 'cpu', probe)).selected).toBe('cpu');
    expect(probe.vulkan).not.toHaveBeenCalled();
    await expect(selectImageAccelerator('qnn', 'cpu', probe)).rejects.toThrow('NPU weights');
  });
  it('does not fall back from QNN NPU to MNN/CPU', async () => {
    const probe = probes();
    probe.npu.mockResolvedValue(false);
    await expect(selectImageAccelerator('qnn', 'auto', probe)).rejects.toThrow('requires an NPU');
  });
});
