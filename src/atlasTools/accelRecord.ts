import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What each model has actually done on each accelerator on THIS phone: how long it took to load, how long the first words took, and whether
 * it kept failing. The automatic choice starts from the model's quantization and the phone's hardware (utils/acceleration.ts) and is then
 * corrected by these measurements: an accelerator that keeps failing for a model is not picked again, and one clearly slower to the first word
 * than another that has been tried is replaced. A backend the person picked themselves is never touched (the caller checks that).
 */
export interface BackendRecord { loads: number; loadMs: number; answers: number; firstWordMs: number /* ms to read 1000 prompt tokens */; failures: number }
const blank = (): BackendRecord => ({ loads: 0, loadMs: 0, answers: 0, firstWordMs: 0, failures: 0 });
const ema = (old: number, n: number, v: number): number => (n > 0 ? old * 0.7 + v * 0.3 : v);

export const recordKey = (file: string, backend: string): string => `${(file.split('/').pop() ?? file).toLowerCase()}|${backend.toLowerCase()}`;

interface State {
  byKey: Record<string, BackendRecord>;
  recordLoad: (file: string, backend: string, ms: number) => void;
  recordAnswer: (file: string, backend: string, firstWordMs: number) => void;
  recordFailure: (file: string, backend: string) => void;
  forget: () => void;
}
const upd = (st: State, key: string, f: (r: BackendRecord) => BackendRecord) => ({ byKey: { ...st.byKey, [key]: f(st.byKey[key] ?? blank()) } });

export const useAccelRecord = create<State>()(persist((set) => ({
  byKey: {},
  recordLoad: (file, backend, ms) => set((st) => (ms > 0 && ms < 600_000 ? upd(st, recordKey(file, backend), (r) => ({ ...r, loads: r.loads + 1, loadMs: ema(r.loadMs, r.loads, ms) })) : st)),
  recordAnswer: (file, backend, ms) => set((st) => (ms > 0 && ms < 600_000 ? upd(st, recordKey(file, backend), (r) => ({ ...r, answers: r.answers + 1, firstWordMs: ema(r.firstWordMs, r.answers, ms) })) : st)),
  recordFailure: (file, backend) => set((st) => upd(st, recordKey(file, backend), (r) => ({ ...r, failures: r.failures + 1 }))),
  forget: () => set({ byKey: {} }),
}), { name: 'atlas-accel-record', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ byKey: s.byKey }) }));

/** Answers needed on both accelerators before one is called faster. */
export const MIN_ANSWERS = 3;
/** The other accelerator must reach the first word at least this much sooner (a share of the current one's time). */
const CLEARLY_FASTER = 0.85;
/** Failures at least this many, and at least as many as successful loads: the accelerator is not trusted for this model. */
const UNSTABLE_AT = 2;

const unstable = (r: BackendRecord | undefined): boolean => !!r && r.failures >= UNSTABLE_AT && r.failures >= r.loads;

export interface Choice { backend: string; why?: string }

/**
 * The accelerator to use for a model, given the one the hardware rules suggest and the ones this phone has. Pure: the measurements are passed in.
 * CPU is always allowed as the last resort. The suggestion stands unless it keeps failing, or another has clearly reached the first word sooner.
 */
export function chooseBackend(input: { file: string; suggested: string; candidates: string[]; records: Record<string, BackendRecord> }): Choice {
  const { file, suggested, candidates, records } = input;
  const rec = (b: string): BackendRecord | undefined => records[recordKey(file, b)];
  const pool = [...new Set([...candidates, 'cpu'])];
  if (unstable(rec(suggested))) {
    const stable = pool.filter((b) => b !== suggested && !unstable(rec(b)));
    const proven = stable.filter((b) => (rec(b)?.loads ?? 0) > 0).sort((a, b) => (rec(a)?.firstWordMs || Infinity) - (rec(b)?.firstWordMs || Infinity))[0];
    const pick = proven ?? (stable.includes('cpu') ? 'cpu' : stable[0]);
    return pick ? { backend: pick, why: `${suggested} failed ${rec(suggested)!.failures} times with this model, so ${pick} is used` } : { backend: suggested };
  }
  const now = rec(suggested);
  if (!now || now.answers < MIN_ANSWERS) return { backend: suggested };
  const better = pool.filter((b) => b !== suggested && !unstable(rec(b)) && (rec(b)?.answers ?? 0) >= MIN_ANSWERS && (rec(b)!.firstWordMs) <= now.firstWordMs * CLEARLY_FASTER)
    .sort((a, b) => rec(a)!.firstWordMs - rec(b)!.firstWordMs)[0];
  return better ? { backend: better, why: `${better} reads a prompt faster with this model (${(rec(better)!.firstWordMs / 1000).toFixed(1)} s per 1000 tokens, against ${(now.firstWordMs / 1000).toFixed(1)} s on ${suggested})` } : { backend: suggested };
}
