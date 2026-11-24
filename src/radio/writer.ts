/**
 * Asks the model for a poem and keeps it only if the code's checks pass (poem.ts). The dice give every line the words it may end with, from
 * rhyme groups (rhymes.ts), and a grammar holds the model to the shape. A tiny model is asked a short, plain question with one worked
 * example, up to a few times; when none passes there is no poem for this song, which the radio treats as a normal result.
 */
import { describeShow, type Random, type Show } from './dice';
import { checkPoem, poemGrammar, type PoemCheck } from './poem';
import { pickRhymeGroups } from './rhymes';
import type { AskModel } from './sound';

function poemSystem(lines: number): string {
  return `You write short poems. Reply with only the poem: exactly ${lines} lines, no title and no notes. Each line is a short sentence of 5 to 9 words that makes sense. Lines that should rhyme end in rhyming words. Never repeat a line.
Example of four lines:
The dog sat down beside the door,
He waited there an hour or more.
The rain came down, the sky turned grey,
But still he would not run away.`;
}

function poemQuestion(show: Show, theme: string): string {
  const station = theme.trim() ? ` The poem is for a radio station about ${theme.trim().slice(0, 160)}.` : '';
  return `Write a ${describeShow(show).replace(/ song about /, ' poem about ')}.${station}`;
}

const POEM_TRIES = 3;

export interface WrittenPoem { lines: string[]; tries: number }

/** The poem for a show, or null when no try passed the checks. `onTry` hears each failed try's problems (for the log). */
export async function writePoem(show: Show, theme: string, model: { ask: AskModel; rng: Random; onTry?: (check: PoemCheck, n: number) => void }): Promise<WrittenPoem | null> {
  const { ask, rng, onTry } = model;
  for (let n = 1; n <= POEM_TRIES; n += 1) {
    // New end words each try: a rhyme the model could not use is not forced on it again.
    const groups = pickRhymeGroups(show.form.scheme, show.form.stanzas, rng);
    let reply: string;
    try { reply = await ask(poemSystem(groups.length), poemQuestion(show, theme), { grammar: poemGrammar(groups), maxTokens: 40 * groups.length }); } catch { return null; }
    const check = checkPoem(reply, show.form);
    if (check.ok) return { lines: check.lines, tries: n };
    onTry?.(check, n);
  }
  return null;
}
