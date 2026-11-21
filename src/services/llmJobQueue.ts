/**
 * One queue for background model jobs (Study, Learning, games, daily brief).
 * They used to poll `isCurrentlyGenerating()` and then call the model, so two
 * background jobs (or a job and a chat that started in between) collided with
 * "Generation already in progress". Jobs now run one at a time, and each waits
 * for a running chat reply to finish first.
 */
import { asBackground } from './backgroundWork';
import { holdScreenAwake, releaseScreenAwake } from '../atlasTools/runtimePower';

let tail: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForChat(maxMs: number, shouldStop?: () => boolean): Promise<void> {
  const { llmService } = require('./llm');
  const until = Date.now() + maxMs;
  while (llmService.isCurrentlyGenerating()) {
    if (shouldStop?.()) throw new Error('stopped');
    if (Date.now() > until) throw new Error('The AI is busy answering a chat. Wait for it to finish (or stop it), then try again.');
    await sleep(500);
  }
}

/** How many background jobs are running: the screen stays on from the first to the last (a lesson, music, the briefing, learning, an exam). */
let jobsInFlight = 0;
/** Goes up each time a chat reply stops a background model call to take its place. */
let preemptions = 0;
/** A job whose model call was stopped for a chat reply is run again, up to this many times, after the reply. */
const MAX_RESTARTS = 3;

/**
 * A chat reply the person asked for goes before background work. If a background job is writing right now, that call is stopped and the reply
 * starts at once (it used to fail with "Generation already in progress"); the job notices, waits for the reply to end and asks again.
 * Returns true when it stopped a background call.
 */
export async function yieldToChat(): Promise<boolean> {
  if (jobsInFlight === 0) return false;
  const { llmService } = require('./llm');
  if (!llmService.isCurrentlyGenerating()) return false;
  preemptions += 1;
  await llmService.stopGeneration();
  await llmService.waitForIdle(5000);
  return true;
}

/**
 * Runs one background model job at a time. A job must be a single model call (with the work to prepare it), so that asking again after a chat reply
 * stopped it repeats nothing but that call: every caller today wraps exactly that.
 */
export function runBackgroundJob<T>(job: () => Promise<T>, opts: { maxWaitMs?: number; shouldStop?: () => boolean } = {}): Promise<T> {
  const run = tail.then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      await waitForChat(opts.maxWaitMs ?? 120_000, opts.shouldStop);
      const mark = preemptions;
      // The screen is held while a job really runs (not while it waits its turn).
      if (jobsInFlight++ === 0) holdScreenAwake('background-ai');
      try {
        const result = await asBackground(job);
        // Stopped for a chat reply: whatever came back is a cut-off answer, not the job's result, so it is asked again after the reply.
        if (preemptions === mark) return result;
        if (attempt >= MAX_RESTARTS) throw new Error('The AI was needed for chat replies too often for this background job to finish. It will be tried again later.');
      } catch (error) {
        if (preemptions === mark || attempt >= MAX_RESTARTS) throw error;
        // a stopped call may reject: that is the stop, not a failure of the job, so it is asked again
      } finally { if (--jobsInFlight === 0) releaseScreenAwake('background-ai'); }
    }
  });
  tail = run.catch(() => undefined);
  return run;
}

/** Keeps the beginning (task) and the end (instructions, output format) of a prompt that is too long. */
export function fitPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = '\n[... part of the material omitted to fit the model ...]\n';
  const room = Math.max(200, maxChars - marker.length);
  const head = Math.floor(room * 0.3);
  return text.slice(0, head) + marker + text.slice(text.length - (room - head));
}
