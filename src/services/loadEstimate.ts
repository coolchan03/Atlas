/**
 * What a text model really needs in memory: the weights, the conversation memory (KV cache, which grows with the context size), a vision
 * projector when there is one, and the runtime's own buffers. It is an ESTIMATE from file sizes and typical architectures, never a
 * promise, so it always comes with a range and is worded that way. Pure.
 */
const GB = 1024 ** 3;
/** KV cache bytes per token per GB of weights: typical 4B-class models use about 59 KB per token for 2.5 GB of weights. */
const KV_BYTES_PER_TOKEN_PER_GB = 59_000;

export interface LoadEstimate { weightsGB: number; kvGB: number; projectorGB: number; overheadGB: number; totalGB: number; lowGB: number; highGB: number; contextLength: number }

export function estimateTextLoad(o: { fileSizeBytes: number; mmProjBytes?: number; contextLength: number; overheadMultiplier: number }): LoadEstimate {
  const weightsGB = Math.max(0, o.fileSizeBytes) / GB;
  const projectorGB = Math.max(0, o.mmProjBytes ?? 0) / GB;
  const kvGB = (Math.max(0, o.contextLength) * KV_BYTES_PER_TOKEN_PER_GB * weightsGB) / GB;
  const overheadGB = weightsGB * Math.max(0, o.overheadMultiplier - 1);
  const totalGB = weightsGB + kvGB + projectorGB + overheadGB;
  // The architecture is not known, so the conversation memory and the overhead are the uncertain parts.
  return { weightsGB, kvGB, projectorGB, overheadGB, totalGB, lowGB: weightsGB + projectorGB + (kvGB + overheadGB) * 0.6, highGB: weightsGB + projectorGB + (kvGB + overheadGB) * 1.5, contextLength: o.contextLength };
}

/** One honest sentence about the estimate. */
export function describeEstimate(e: LoadEstimate): string {
  const kv = e.kvGB >= 0.05 ? `, of which about ${e.kvGB.toFixed(1)} GB is conversation memory for a ${e.contextLength} token context` : '';
  return `Estimate: about ${e.totalGB.toFixed(1)} GB (likely between ${e.lowGB.toFixed(1)} and ${e.highGB.toFixed(1)} GB)${kv}. This is an estimate from the file size, not a guarantee.`;
}

/** Choices the person can take when it may not fit. Atlas never applies one by itself. */
export function loadAlternatives(e: LoadEstimate, budgetGB: number): string[] {
  const out: string[] = [];
  if (e.highGB > budgetGB || e.totalGB > budgetGB) {
    const halves = [e.contextLength / 2, e.contextLength / 4].filter((c) => c >= 1024);
    for (const c of halves) {
      const cheaper = e.weightsGB + e.projectorGB + e.overheadGB + e.kvGB * (c / e.contextLength);
      if (cheaper <= budgetGB) { out.push(`Lower the context size to ${Math.round(c)} tokens (about ${cheaper.toFixed(1)} GB).`); break; }
    }
    out.push('Pick a smaller or more compressed (lower bit) version of this model.');
    out.push('Close other apps to free memory, then try again.');
  }
  return out;
}
