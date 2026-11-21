/**
 * What a model load gave up to fit this phone, in plain words, for the load report on the model card. The engine retries with a smaller context,
 * fewer layers on the accelerator, or the CPU when memory or the accelerator refuses; those used to be written only to the debug log, so a model
 * that felt slower or forgot sooner gave no hint why. Pure.
 */
export interface FallbackFacts {
  requestedContext: number;
  actualContext: number;
  /** The accelerator was asked for and could not start the model. */
  gpuAttemptFailed: boolean;
  backend: string;
  requestedGpuLayers: number;
  attemptedGpuLayers: number;
}

const ACCELERATOR: Record<string, string> = { opencl: 'The GPU (OpenCL)', htp: 'The NPU', vulkan: 'The GPU (Vulkan)', metal: 'The GPU (Metal)' };

export function loadFallbackNotes(f: FallbackFacts): string[] {
  const notes: string[] = [];
  if (f.actualContext > 0 && f.actualContext < f.requestedContext) {
    notes.push(`The context was reduced from ${f.requestedContext} to ${f.actualContext} tokens to fit this phone's memory, so a long chat or long documents are cut off sooner. Closing other apps, or a smaller model, brings it back.`);
  }
  if (f.gpuAttemptFailed && f.backend !== 'cpu') {
    notes.push(`${ACCELERATOR[f.backend] ?? 'The accelerator'} could not start this model, so it runs on the CPU, which is slower.`);
  } else if (f.attemptedGpuLayers > 0 && f.attemptedGpuLayers < f.requestedGpuLayers) {
    notes.push(`Only ${f.attemptedGpuLayers} of ${f.requestedGpuLayers} layers run on the accelerator, because the rest did not fit in memory.`);
  }
  return notes;
}
