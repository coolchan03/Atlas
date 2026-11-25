/**
 * Songs about anything: now and then the model thinks up what the next song is about instead of the dice picking from the table, so the
 * station never runs out. The answer is held to a few lowercase words by a grammar and checked by code (length, unsuitable words, not a
 * topic played lately); anything else is dropped and the dice's topic stands.
 */
import { isUnsuitable } from './poem';
import type { Show } from './dice';
import type { AskModel } from './sound';

/** Every third song is about something the model thought up; on the songs between, the model may think up who it is about. */
export const INVENT_EVERY = 3;
export type Invented = 'topic' | 'subject';
const GRAMMAR = 'root ::= word (" " word){2,6}\nword ::= [a-z]{2,12}';
const SYSTEM: Record<Invented, string> = {
  topic: 'You think up what a song is about for a radio station. Answer with 3 to 7 plain lowercase words and nothing else: no punctuation, no title, no explanation. Be specific and surprising: a small scene, a person with a problem, an odd object, a place at a certain hour.',
  subject: 'You think up who or what a song is about for a radio station. Answer with 3 to 7 plain lowercase words and nothing else: no punctuation, no title, no explanation. Be specific and surprising: a particular person, animal or thing, with one odd detail.',
};
const EXAMPLES: Record<Invented, string> = {
  topic: 'the last lighthouse keeper retires; a sock that outlived its pair; two strangers share an umbrella.',
  subject: 'a pigeon who delivers the wrong mail; my grandfather the retired magician; a lamp that remembers every room.',
};

interface Ask { kind: Invented; show: Show; theme: string; recent: string[] }
const question = ({ kind, show, theme, recent }: Ask): string => [
  `Style of the song: ${show.genre.label}. Mood: ${show.tone}.`,
  theme.trim() ? `The station is about: ${theme.trim()}.` : '',
  kind === 'subject' ? `The song is about ${show.topic.text}.` : '',
  `Examples of the kind of answer wanted: ${EXAMPLES[kind]}`,
  recent.length ? `Not these (already played): ${recent.slice(-6).join('; ')}.` : '',
  kind === 'subject' ? 'Who or what is it about?' : 'What is the next song about?',
].filter(Boolean).join('\n');

/** The topic (or, for `kind` subject, the who) the model thought up, or null when it did not give a usable one. */
export async function inventTopic(ask: AskModel, context: { kind?: Invented; show: Show; theme: string; recent: string[] }): Promise<string | null> {
  const { kind = 'topic', show, theme, recent } = context;
  try {
    const text = (await ask(SYSTEM[kind], question({ kind, show, theme, recent }), { grammar: GRAMMAR, maxTokens: 24 })).trim().toLowerCase().replace(/\s+/g, ' ');
    const words = text.split(' ');
    if (!/^[a-z ]+$/.test(text) || words.length < 3 || words.length > 7 || text.length > 60) return null;
    if (isUnsuitable(text) || recent.some((r) => r.toLowerCase() === text)) return null;
    return text;
  } catch { return null; }
}
