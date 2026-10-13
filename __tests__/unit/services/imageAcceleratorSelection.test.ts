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
  // Auto falls back to CPU with a visible note (audit G13); explicit GPU mode stays strict.
  it('Auto falls back to CPU (with a note) when the diffusion GPU is unavailable; GPU mode is strict', async () => {
    const probe = probes();
    probe.vulkan.mockResolvedValue({ enumerated: false, detail: 'no supported GPU' });
    const auto = await selectImageAccelerator('sdcpp', 'auto', probe);
    expect(auto.selected).toBe('cpu');
    expect(auto.note).toMatch(/CPU fallback/);
    expect(probe.opencl).not.toHaveBeenCalled();
    await expect(selectImageAccelerator('sdcpp', 'gpu', probe)).rejects.toThrow('Vulkan GPU not available');
  });
  it('uses OpenCL for MNN in Auto when present, else CPU; GPU mode requires it', async () => {
    const probe = probes();
    expect((await selectImageAccelerator('mnn', 'auto', probe)).selected).toBe('opencl');
    probe.opencl.mockResolvedValue({ supported: false });
    expect((await selectImageAccelerator('mnn', 'auto', probe)).selected).toBe('cpu');
    await expect(selectImageAccelerator('mnn', 'gpu', probe)).rejects.toThrow('OpenCL not detected');
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
