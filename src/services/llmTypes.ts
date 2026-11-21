export interface MultimodalSupport {
  vision: boolean;
  audio: boolean;
}

export interface LLMPerformanceSettings {
  nThreads: number;
  nBatch: number;
  contextLength: number;
}

export interface LLMPerformanceStats {
  lastTokensPerSecond: number;
  lastDecodeTokensPerSecond: number;
  /** Seconds from asking to the first word. */
  lastTimeToFirstToken: number;
  lastGenerationTime: number;
  lastTokenCount: number;
  /** True when the completion hit the n_predict cap without an EOS token (cut off mid-output, B15). */
  lastTruncated?: boolean;
}

/** One optional part of a loaded model (the picture file, MTP drafting) and whether it is really running. */
interface LoadedComponent {
  /** The model has this attached and it is switched on. */
  requested: boolean;
  /** The native engine actually started it. Not assumed from `requested`. */
  loaded: boolean;
  /** Rough extra memory it holds (the attached file's size). 0 when unknown (MTP layers inside the model file). */
  estimatedMB: number;
  /** Why it was left out, in plain words, when requested but not loaded. */
  skippedBecause?: string;
}

export interface LoadReport {
  safeMode: boolean;
  backend: string;
  /** Plain-language notes on anything switched off or changed during this load. */
  notes: string[];
  vision: LoadedComponent;
  mtp: LoadedComponent & { kind: 'file' | 'embedded' | 'none' };
}
