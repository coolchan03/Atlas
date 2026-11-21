/**
 * What happened during one attempt to have the AI write a tune: which model, how big each question was, how long each answer took, what the
 * answer looked like, why it was accepted or rejected, and in the end whether the tune is the AI's or the built-in composer's and why. Kept for
 * the last few tunes so "why did it fall back?" can be answered from facts instead of guessed. Pure data plus a tiny in-memory log.
 */
export type ComposeStage = 'score' | 'melody' | 'title';
export type AttemptOutcome = 'pending' | 'accepted' | 'rejected' | 'error';

export interface ComposeAttempt {
  stage: ComposeStage;
  promptChars: number;
  replyChars: number;
  /** The first characters of the reply, to see at a glance whether it was a score, prose, or nothing. */
  replyHead: string;
  ms: number;
  outcome: AttemptOutcome;
  /** Why it was rejected or failed (the checker's own words). */
  reason?: string;
}

export interface ComposeRun {
  at: number;
  /** The request, shortened. */
  request: string;
  style: string;
  /** The model that wrote (name, or id when it has no name), '' when unknown. */
  model: string;
  /** Tokens a second this model writes at, when measured: a slow writer is asked for the melody only. */
  writingSpeed?: number;
  attempts: ComposeAttempt[];
  /** Filled in at the end. */
  via?: 'composer' | 'built-in';
  /** For a built-in result: the reason, in plain words. */
  fallbackReason?: string;
  totalMs?: number;
}

const MAX_RUNS = 5;
const runs: ComposeRun[] = [];

export function startRun(info: { request: string; style: string; model: string; writingSpeed?: number }, now = Date.now()): ComposeRun {
  const run: ComposeRun = { at: now, request: info.request.replace(/\s+/g, ' ').trim().slice(0, 80), style: info.style, model: info.model, ...(info.writingSpeed ? { writingSpeed: info.writingSpeed } : {}), attempts: [] };
  runs.push(run);
  if (runs.length > MAX_RUNS) runs.shift();
  return run;
}

/** Records a question to the model and its answer. The outcome starts as pending: the code that reads the answer decides it with `markLast`. */
export function recordAttempt(run: ComposeRun, a: { stage: ComposeStage; prompt: string; reply?: string; ms: number; error?: string }): ComposeAttempt {
  const attempt: ComposeAttempt = {
    stage: a.stage, promptChars: a.prompt.length, replyChars: a.reply?.length ?? 0,
    replyHead: (a.reply ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ms: Math.max(0, Math.round(a.ms)),
    outcome: a.error ? 'error' : 'pending',
    ...(a.error ? { reason: a.error.slice(0, 200) } : {}),
  };
  run.attempts.push(attempt);
  return attempt;
}

/** The latest attempt of a stage was accepted or rejected, and why. */
export function markLast(run: ComposeRun, verdict: { stage: ComposeStage; outcome: 'accepted' | 'rejected'; reason?: string }): void {
  const { stage, outcome, reason } = verdict;
  for (let i = run.attempts.length - 1; i >= 0; i--) {
    if (run.attempts[i].stage === stage && run.attempts[i].outcome === 'pending') { run.attempts[i] = { ...run.attempts[i], outcome, ...(reason ? { reason: reason.slice(0, 200) } : {}) }; return; }
  }
}

export function finishRun(run: ComposeRun, result: { via: 'composer' | 'built-in'; note: string }, now = Date.now()): void {
  run.via = result.via;
  run.totalMs = Math.max(0, now - run.at);
  if (result.via === 'built-in') run.fallbackReason = fallbackReasonOf(run, result.note);
}

/** The last tunes' records, newest last. */
export const composeRuns = (): ComposeRun[] => runs.map((r) => ({ ...r, attempts: [...r.attempts] }));
export const clearComposeRuns = (): void => { runs.length = 0; };

/** The one cause to blame for a built-in result: the last thing the model did, in plain words. */
export function fallbackReasonOf(run: ComposeRun, note = ''): string {
  const score = run.attempts.filter((a) => a.stage === 'score' || a.stage === 'melody');
  if (!run.attempts.length) return 'The model was never asked (none was available to write).';
  const last = score[score.length - 1];
  if (!last) return note || 'No score or melody was requested from the model.';
  if (last.outcome === 'error') return `The model failed after ${(last.ms / 1000).toFixed(0)} s: ${last.reason ?? 'unknown error'}.`;
  if (last.outcome === 'rejected' || last.outcome === 'pending') {
    if (last.replyChars === 0) return `The model answered with nothing (after ${(last.ms / 1000).toFixed(0)} s).`;
    return `The checker rejected the model's ${last.stage}: ${last.reason ?? 'it could not be read'}. The reply began: "${last.replyHead}".`;
  }
  return note || 'The built-in composer was used.';
}

/** A few plain lines for the log screen or a report: the model, what was asked, what came back and what was decided. */
export function describeRun(run: ComposeRun): string {
  const head = `[MUSIC-RUN] ${run.via === 'composer' ? 'AI-written' : run.via === 'built-in' ? 'built-in composer' : 'unfinished'}; model ${run.model || 'unknown'}${run.writingSpeed ? ` (${run.writingSpeed.toFixed(1)} tok/s)` : ''}; style ${run.style}; ${((run.totalMs ?? 0) / 1000).toFixed(0)} s in all`;
  const lines = run.attempts.map((a, i) => `  ${i + 1}. ${a.stage}: ${a.outcome}${a.reason ? ` (${a.reason})` : ''}; prompt ${a.promptChars} chars, reply ${a.replyChars} chars in ${(a.ms / 1000).toFixed(0)} s${a.replyHead ? `; began "${a.replyHead}"` : ''}`);
  return [head, ...lines, ...(run.fallbackReason ? [`  Why built-in: ${run.fallbackReason}`] : [])].join('\n');
}
