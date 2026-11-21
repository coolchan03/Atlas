/**
 * Layer offload accounting shared by every text backend. llama.cpp assigns
 * min(n_gpu_layers, block_count + 1) layers to the GPU: the repeating blocks plus
 * the output layer. Reporting the requested number (often 99) overstated offload.
 */

/** Total offloadable layers (block_count + 1) from GGUF metadata, or -1 when unknown. */
export function modelLayerTotal(metadata: Record<string, unknown> | null | undefined): number {
  if (!metadata) return -1;
  const arch = metadata['general.architecture'];
  const raw = typeof arch === 'string' ? metadata[`${arch}.block_count`] : undefined;
  const blocks = Number(raw);
  return Number.isFinite(blocks) && blocks > 0 ? Math.floor(blocks) + 1 : -1;
}

/**
 * How many multi-token-prediction layers the model file itself contains, read from its GGUF metadata (`<architecture>.nextn_predict_layers`).
 * null when the metadata could not be read, so "unknown" is never confused with "none". Never guessed from a model's name or family.
 */
export function embeddedMtpLayers(metadata: Record<string, unknown> | null | undefined): number | null {
  if (!metadata || !Object.keys(metadata).length) return null;
  const key = Object.keys(metadata).find((k) => k.endsWith('.nextn_predict_layers'));
  if (!key) return 0;
  const layers = Number(metadata[key]);
  return Number.isFinite(layers) && layers > 0 ? Math.floor(layers) : 0;
}

/** Layers actually placed on the accelerator; unchanged when the total is unknown. */
export function effectiveOffloadedLayers(requested: number, totalLayers: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return totalLayers > 0 ? Math.min(requested, totalLayers) : requested;
}

/** "29 of 29 layers" / "12 of 29 layers" / "12 layers" when the total is unknown. */
export function describeOffload(active: number, totalLayers: number): string {
  if (active <= 0) return 'no layers';
  return totalLayers > 0 ? `${active} of ${totalLayers} layers` : `${active} layers`;
}
