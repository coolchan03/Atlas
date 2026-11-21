/**
 * Where the time of the last few requests went, by stage, so "it was slow" can be told apart: loading the model, reading the prompt, the wait for
 * the first word, writing, looking up documents, and running tools. Kept in memory (a short ring per stage) and written into the support report.
 * Speech is not measured here yet: the call timing line covers the whole wait before the voice starts, not the voice engine alone.
 */
export type Stage = 'loading' | 'prompt' | 'first word' | 'writing' | 'retrieval' | 'tools';
const ORDER: Stage[] = ['loading', 'prompt', 'first word', 'writing', 'retrieval', 'tools'];
const KEEP = 20;
const ring: Record<Stage, number[]> = { loading: [], prompt: [], 'first word': [], writing: [], retrieval: [], tools: [] };

/** Records one duration (milliseconds). A missing, negative or absurd one (over an hour) is ignored. */
export function noteStage(stage: Stage, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0 || ms > 3_600_000) return;
  const list = ring[stage];
  list.push(Math.round(ms));
  if (list.length > KEEP) list.shift();
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;

/** One line per stage that has been timed: the last time, and the median of the last few. */
export function stageSummary(): string[] {
  return ORDER.filter((s) => ring[s].length > 0).map((s) => {
    const list = ring[s];
    const sorted = [...list].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return `${s}: last ${secs(list[list.length - 1])}, typical ${secs(median)} (${list.length} timed)`;
  });
}

export function resetStageTimes(): void { for (const s of ORDER) ring[s].length = 0; }
