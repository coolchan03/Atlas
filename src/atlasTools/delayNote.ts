import type { GenerationMeta } from '../types';

/**
 * One plain sentence about why a reply felt slow, for people who do not read tokens a second. Only for a reply that really was slow (the first word
 * took more than a few seconds, or the writing crawled): a normal reply gets nothing, and the technical figures stay in the generation details.
 * Time to the first word is the wait while the model reads the conversation; writing speed is how fast it then produces words.
 */
export const SLOW_FIRST_WORD_SEC = 8;
export const SLOW_WRITING_TPS = 3;

/** timeToFirstToken is in seconds in a reply's details (see GenerationMeta). */
export function explainDelay(meta: Pick<GenerationMeta, 'timeToFirstToken' | 'decodeTokensPerSecond'> | undefined): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  const first = meta.timeToFirstToken ?? 0;
  if (first >= SLOW_FIRST_WORD_SEC) {
    parts.push(`It took ${Math.round(first)} s to start answering, because the model reads the whole conversation and any documents first. A new chat, or fewer attached passages, starts sooner.`);
  }
  // Writing speed is the decode speed only: the overall speed includes the wait for the first word, so a short reply after a long wait would read as slow writing.
  const writing = meta.decodeTokensPerSecond ?? 0;
  if (writing > 0 && writing < SLOW_WRITING_TPS) {
    const wordsPerMinute = Math.round(writing * 0.75 * 60);
    parts.push(`It then wrote about ${wordsPerMinute} words a minute. A smaller model, or Quick mode in chat settings, is faster.`);
  }
  return parts.length ? parts.join(' ') : null;
}
