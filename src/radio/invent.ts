/**
 * Songs about anything: now and then the model thinks up what the next song is about instead of the dice picking from the table, so the
 * station never runs out. The answer is held to a few lowercase words by a grammar and checked by code (length, unsuitable words, not a
 * topic played lately); anything else is dropped and the dice's topic stands.
 */
import { isUnsuitable } from './poem';
import type { Show } from './dice';
import type { AskModel } from './sound';

/** Every third song is about something the model thought up. */
export const INVENT_EVERY = 3;
const GRAMMAR = 'root ::= word (" " word){2,6}\nword ::= [a-z]{2,12}';
const SYSTEM = 'You think up what a song is about for a radio station. Answer with 3 to 7 plain lowercase words and nothing else: no punctuation, no title, no explanation. Be specific and surprising: a small scene, a person with a problem, an odd object, a place at a certain hour.';

const question = (show: Show, theme: string, recent: string[]): string => [
  `Style of the song: ${show.genre.label}. Mood: ${show.tone}.`,
  theme.trim() ? `The station is about: ${theme.trim()}.` : '',
  'Examples of the kind of answer wanted: the last lighthouse keeper retires; a sock that outlived its pair; two strangers share an umbrella.',
  recent.length ? `Not these (already played): ${recent.slice(-6).join('; ')}.` : '',
  'What is the next song about?',
].filter(Boolean).join('\n');

/** The topic the model thought up, or null when it did not give a usable one. */
export async function inventTopic(ask: AskModel, context: { show: Show; theme: string; recent: string[] }): Promise<string | null> {
  const { show, theme, recent } = context;
  try {
    const text = (await ask(SYSTEM, question(show, theme, recent), { grammar: GRAMMAR, maxTokens: 24 })).trim().toLowerCase().replace(/\s+/g, ' ');
    const words = text.split(' ');
    if (!/^[a-z ]+$/.test(text) || words.length < 3 || words.length > 7 || text.length > 60) return null;
    if (isUnsuitable(text) || recent.some((r) => r.toLowerCase() === text)) return null;
    return text;
  } catch { return null; }
}
