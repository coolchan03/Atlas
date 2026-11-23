/**
 * Asks the model for a poem and keeps it only if the code's checks pass (poem.ts). The dice choose the word every line ends with (rhymes.ts)
 * and a grammar holds the model to the shape; a tiny model is asked a short, plain question with one worked example, up to a few tries, and when none passes there is no poem for this song,
 * which the radio treats as a normal result.
 */
import { describeShow, type Random, type Show } from './dice';
import { checkPoem, poemGrammar, type PoemCheck } from './poem';
import { pickEnds } from './rhymes';
import type { AskModel } from './sound';

export function poemSystem(ends: string[]): string {
  const total = ends.length;
  const rules = ends.map((end, i) => `Line ${i + 1} ends with the word "${end}".`).join(' ');
  return `You write short poems. Reply with only the poem: exactly ${total} lines, no title and no notes. Each line is a short sentence of 5 to 9 words. ${rules} Never repeat a line.
Example of four lines, ending in door, more, grey, away:
The dog sat down beside the door,
He waited there an hour or more.
The rain came down, the sky turned grey,
But still he would not run away.`;
}

export function poemQuestion(show: Show, theme: string): string {
  const station = theme.trim() ? ` The poem is for a radio station about ${theme.trim().slice(0, 160)}.` : '';
  return `Write a ${describeShow(show).replace(/ song about /, ' poem about ')}.${station}`;
}

export const POEM_TRIES = 3;

export interface WrittenPoem { lines: string[]; tries: number }

/** The poem for a show, or null when no try passed the checks. `onTry` hears each failed try's problems (for the log). */
export async function writePoem(show: Show, theme: string, model: { ask: AskModel; rng: Random; onTry?: (check: PoemCheck, n: number) => void }): Promise<WrittenPoem | null> {
  const { ask, rng, onTry } = model;
  for (let n = 1; n <= POEM_TRIES; n += 1) {
    // New end words each try: a word the model could not use is not forced on it again.
    const ends = pickEnds(show.form.scheme, show.form.stanzas, rng);
    let reply: string;
    try { reply = await ask(poemSystem(ends), poemQuestion(show, theme), { grammar: poemGrammar(ends), maxTokens: 40 * ends.length }); } catch { return null; }
    const check = checkPoem(reply, show.form, ends);
    if (check.ok) return { lines: check.lines, tries: n };
    onTry?.(check, n);
  }
  return null;
}
