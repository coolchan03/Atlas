/**
 * One queue for background model jobs (Study, Learning, games, daily brief).
 * They used to poll `isCurrentlyGenerating()` and then call the model, so two
 * background jobs (or a job and a chat that started in between) collided with
 * "Generation already in progress". Jobs now run one at a time, and each waits
 * for a running chat reply to finish first.
 */
let tail: Promise<unknown> = Promise.resolve();
let waiting = 0;

export function pendingBackgroundJobs(): number { return waiting; }

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

export function runBackgroundJob<T>(job: () => Promise<T>, opts: { maxWaitMs?: number; shouldStop?: () => boolean } = {}): Promise<T> {
  waiting++;
  const run = tail.then(async () => {
    try {
      await waitForChat(opts.maxWaitMs ?? 120_000, opts.shouldStop);
      return await job();
    } finally { waiting--; }
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
