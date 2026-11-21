import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Does speculative decoding (an MTP file, or MTP layers inside the model) actually make THIS model faster on THIS phone? Writing speed is
 * remembered separately for replies written with it and without it, so the answer comes from the phone's own replies, not from a claim.
 * The result is shown on the model card; nothing is switched off by it (the person chose to attach it).
 */
interface Side { decode: number; samples: number }
export interface SpecRecord { on: Side; off: Side }

interface SpecState {
  byModel: Record<string, SpecRecord>;
  record: (modelId: string, drafting: boolean, decode: number) => void;
  forget: (modelId: string) => void;
}

const empty = (): SpecRecord => ({ on: { decode: 0, samples: 0 }, off: { decode: 0, samples: 0 } });
const fold = (s: Side, v: number): Side => ({ decode: s.samples > 0 ? s.decode * 0.7 + v * 0.3 : v, samples: s.samples + 1 });

export const useSpecBenefit = create<SpecState>()(persist((set) => ({
  byModel: {},
  record: (modelId, drafting, decode) => set((st) => {
    // A reply too short to time, or a number that cannot be a speed, says nothing.
    if (!modelId || !Number.isFinite(decode) || decode <= 0 || decode > 2000) return st;
    const cur = st.byModel[modelId] ?? empty();
    const next: SpecRecord = drafting ? { ...cur, on: fold(cur.on, decode) } : { ...cur, off: fold(cur.off, decode) };
    return { byModel: { ...st.byModel, [modelId]: next } };
  }),
  forget: (modelId) => set((st) => { const { [modelId]: _drop, ...rest } = st.byModel; return { byModel: rest }; }),
}), { name: 'atlas-spec-benefit', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ byModel: s.byModel }) }));

/** Replies needed on each side before a comparison means anything. */
export const MIN_SAMPLES = 3;
/** Within this share of equal is "no real difference". */
const SAME_WITHIN = 0.08;

export type SpecVerdict = { kind: 'unknown' } | { kind: 'helps' | 'hurts' | 'same'; percent: number };

/** Pure: the comparison from what was measured. */
export function specVerdict(r: SpecRecord | undefined): SpecVerdict {
  if (!r || r.on.samples < MIN_SAMPLES || r.off.samples < MIN_SAMPLES || r.off.decode <= 0) return { kind: 'unknown' };
  const ratio = r.on.decode / r.off.decode;
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  if (ratio >= 1 + SAME_WITHIN) return { kind: 'helps', percent };
  if (ratio <= 1 - SAME_WITHIN) return { kind: 'hurts', percent };
  return { kind: 'same', percent };
}

/** One plain sentence for the model card, or null while there is not enough to say. */
export function describeSpec(modelId: string, record: SpecRecord | undefined = useSpecBenefit.getState().byModel[modelId]): string | null {
  const v = specVerdict(record);
  if (v.kind === 'unknown') return null;
  if (v.kind === 'helps') return `Measured on this phone: replies are written about ${v.percent}% faster with it.`;
  if (v.kind === 'hurts') return `Measured on this phone: replies are written about ${v.percent}% slower with it. Turning it off may be faster.`;
  return 'Measured on this phone: no clear difference in speed with it.';
}
