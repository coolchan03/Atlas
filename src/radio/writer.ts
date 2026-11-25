/**
 * Asks the model for a titled poem and keeps it only if the code's checks pass (poem.ts). The dice give every line the words it may end with, from
 * rhyme groups (rhymes.ts), and a grammar holds the model to the shape. A tiny model is asked a short, plain question with one worked
 * example, up to a few times; when none passes there is no poem for this song, which the radio treats as a normal result.
 */
import { describeShow, type Random, type Show } from './dice';
import { checkTitledPoem, poemGrammar, type PoemCheck } from './poem';
import { pickRhymeGroups } from './rhymes';
import type { AskModel } from './sound';

function poemSystem(lines: number): string {
  return `You write short poems. Reply with a title of 2 to 5 words on the first line, then the poem: exactly ${lines} lines, and no notes. Each line is a short sentence of 5 to 9 words that makes sense. Lines that should rhyme end in rhyming words. Never repeat a line. The title names what the poem is about.
Example of a title and four lines:
The Patient Dog
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

export interface WrittenPoem { title: string; lines: string[]; tries: number }

/** The poem for a show, or null when no try passed the checks. `onTry` hears each failed try's problems (for the log). */
export async function writePoem(show: Show, theme: string, model: { ask: AskModel; rng: Random; onTry?: (check: PoemCheck, n: number) => void }): Promise<WrittenPoem | null> {
  const { ask, rng, onTry } = model;
  for (let n = 1; n <= POEM_TRIES; n += 1) {
    // New end words each try: a rhyme the model could not use is not forced on it again.
    const groups = pickRhymeGroups(show.form.scheme, show.form.stanzas, rng);
    let reply: string;
    try { reply = await ask(poemSystem(groups.length), poemQuestion(show, theme), { grammar: poemGrammar(groups), maxTokens: 40 * groups.length + 16 }); } catch { return null; }
    const check = checkTitledPoem(reply, show.form);
    if (check.ok) return { title: check.title, lines: check.lines, tries: n };
    onTry?.(check, n);
  }
  return null;
}
