/**
 * Image inference uses distinct native runtimes. Never route a checkpoint into a
 * different model format's runtime or silently choose CPU in automatic mode.
 */
export type ImageComputeMode = 'auto' | 'gpu' | 'cpu';
export type ImageBackend = 'sdcpp' | 'mnn' | 'qnn' | 'coreml' | string;
export type ImageComputeDecision = {
  useOpenCL: boolean;
  selected: 'vulkan' | 'opencl' | 'npu' | 'cpu' | 'coreml';
  note: string;
};
type Probes = {
  vulkan: () => Promise<{ enumerated: boolean; detail: string }>;
  opencl: () => Promise<{ supported: boolean; reason?: string }>;
  npu: () => Promise<boolean>;
};

/** Defaults to Auto; legacy explicit CPU setting remains respected by migration. */
export function imageComputeMode(settings: {
  imageBackendMode?: ImageComputeMode; imageUseOpenCL?: boolean;
}): ImageComputeMode {
  return settings.imageBackendMode ??
    (settings.imageUseOpenCL === false ? 'cpu' : 'auto');
}

export async function selectImageAccelerator(
  backend: ImageBackend,
  mode: ImageComputeMode,
  probe: Probes,
): Promise<ImageComputeDecision> {
  if (backend === 'coreml') {
    if (mode === 'cpu')
      throw new Error('Core ML CPU-only execution is not selectable in this image runtime.');
    return { useOpenCL: false, selected: 'coreml', note: 'Core ML backend selected' };
  }
  if (mode === 'cpu') {
    if (backend === 'qnn') {
      throw new Error('This image package contains NPU weights, not CPU weights. Import a CPU/MNN version to select CPU.');
    }
    return { useOpenCL: false, selected: 'cpu', note: 'CPU explicitly selected' };
  }
  if (backend === 'sdcpp') {
    const gpu = await probe.vulkan();
    if (!gpu.enumerated) {
      if (mode === 'gpu') throw new Error('Native diffusion Vulkan GPU not available: ' + gpu.detail);
      return { useOpenCL: false, selected: 'cpu', note: 'CPU fallback: Vulkan unavailable (' + gpu.detail + ')' };
    }
    return { useOpenCL: true, selected: 'vulkan',
      note: 'Vulkan device detected; actual diffusion shaders still need to execute' };
  }
  if (backend === 'mnn') {
    const gpu = await probe.opencl();
    if (!gpu.supported) {
      if (mode === 'gpu') throw new Error('OpenCL not detected for this image model (' + (gpu.reason ?? 'unknown reason') + ')');
      return { useOpenCL: false, selected: 'cpu', note: 'CPU fallback: OpenCL unavailable (' + (gpu.reason ?? 'unknown reason') + ')' };
    }
    return { useOpenCL: true, selected: 'opencl',
      note: 'OpenCL requested; MNN compute support must be confirmed by rendering' };
  }
  if (backend === 'qnn') {
    if (!await probe.npu())
      throw new Error('This image package requires an NPU, but no supported NPU was found. CPU was not chosen automatically.');
    return { useOpenCL: false, selected: 'npu',
      note: 'QNN NPU package selected; no CPU fallback permitted' };
  }
  throw new Error('Unknown image model backend: ' + backend);
}
