/**
 * The radio's poems. A tiny model is asked for a short poem of a fixed shape; plain code reads what came back and checks the shape it was
 * given (how many lines, how long each is, which line ends rhyme, no repeats, nothing unsuitable). A poem that fails is asked for again, and
 * if none passes the song plays without one: the rules are held by code, never trusted to the model.
 */
import { sureRhyme } from './rhymes';
import type { Form } from './tables';

export interface PoemCheck { ok: boolean; lines: string[]; problems: string[] }

const BANNED = /\b(fuck\w*|shit\w*|bitch\w*|cunt|dick|piss\w*|slut\w*|whore|nigg\w*|fag\w*|retard\w*|rape\w*|kill (myself|yourself)|suicide)\b/i;
const CHATTER = /^(sure|here('| i)s|okay|ok|certainly|title|poem|verse|stanza|chorus|\(|\[|note|this poem|i hope)/i;

/** The lines of a model's reply: fences, thinking, list marks, quotes, stars and chatter before or after the poem are removed. */
export function readPoemLines(raw: string): string[] {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*/gi, '');
  return text.split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/[*_#>"“”]/g, '').trim())
    .filter((l) => l.length > 0 && !CHATTER.test(l) && !/^(stanza|verse)\s*\d+\s*:?$/i.test(l));
}

const lastWord = (line: string): string => (line.toLowerCase().replace(/[^a-z' -]/g, '').trim().split(/[\s-]+/).pop() ?? '').replace(/'/g, '');

/** The ending sound of a word, roughly: its last vowel group and what follows it ("night" and "light" both give "ight"). */
function ending(word: string): string {
  const w = word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
  return /[aeiouy]+[^aeiouy]*e?$/.exec(w)?.[0] ?? w;
}

/** True when two different words end with the same sound. Approximate (spelling is not sound), but it keeps out most non-rhymes. */
export function rhymes(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  if (sureRhyme(a, b)) return true;
  const x = ending(a); const y = ending(b);
  if (x === y) return true;
  const n = Math.min(3, a.length, b.length);
  return n >= 3 && a.slice(-n) === b.slice(-n);
}

/** Which line ends must rhyme, by position within a stanza (pairs of indexes). */
const PAIRS: Record<Form['scheme'], Array<[number, number]>> = { AABB: [[0, 1], [2, 3]], ABAB: [[0, 2], [1, 3]], ABCB: [[1, 3]], AA: [[0, 1]] };

/** Checks a reply against the form it was asked to take. `ends`, when given, are the words the lines were told to end with. */
export function checkPoem(raw: string, form: Form, ends?: string[]): PoemCheck {
  const lines = readPoemLines(raw);
  const need = form.stanzas * form.lines;
  const problems: string[] = [];
  if (lines.length !== need) problems.push(`${lines.length} lines instead of ${need}`);
  const seen = new Set<string>();
  for (const line of lines) {
    const words = line.split(/\s+/).length;
    if (words < 3 || words > 16 || line.length > 100) problems.push(`a line of ${words} words`);
    if (BANNED.test(line)) problems.push('unsuitable word');
    if (/[^\x20-\x7e -ɏ‘’–—]/.test(line)) problems.push('a symbol or emoji');
    const key = line.toLowerCase().replace(/[^a-z ]/g, '');
    if (seen.has(key)) problems.push('a repeated line');
    seen.add(key);
  }
  if (lines.length === need && ends) {
    lines.forEach((line, i) => { if (lastWord(line) !== ends[i]) problems.push(`line ${i + 1} ends in "${lastWord(line)}", not "${ends[i]}"`); });
  } else if (lines.length === need) {
    for (let s = 0; s < form.stanzas; s += 1) {
      const stanza = lines.slice(s * form.lines, (s + 1) * form.lines).map(lastWord);
      for (const [i, j] of PAIRS[form.scheme]) if (!rhymes(stanza[i], stanza[j])) problems.push(`stanza ${s + 1}: "${stanza[i]}" and "${stanza[j]}" do not rhyme`);
    }
  }
  return { ok: problems.length === 0, lines: lines.slice(0, need), problems };
}

/** The scheme in words for the model: AABB is "lines 1 and 2 rhyme, lines 3 and 4 rhyme". */
export function schemeWords(scheme: Form['scheme']): string {
  return { AABB: 'lines 1 and 2 end in rhyming words, and lines 3 and 4 end in rhyming words', ABAB: 'lines 1 and 3 end in rhyming words, and lines 2 and 4 end in rhyming words', ABCB: 'lines 2 and 4 end in rhyming words', AA: 'both lines end in rhyming words' }[scheme];
}

/** Text for the voice: one line per breath, a pause between stanzas, so a flat voice reads it at a steady pace. */
export function poemForVoice(lines: string[], form: Form): string {
  const out: string[] = [];
  lines.forEach((line, i) => { out.push(/[.!?,;:]$/.test(line) ? line : `${line},`); if ((i + 1) % form.lines === 0 && i + 1 < lines.length) out.push('...'); });
  return out.join(' ');
}

/**
 * A grammar (GBNF, the format the engine reads) that makes the model write exactly the poem's shape: one line for each end word, each of 4
 * to 9 plain words, ending in the word the dice chose. The model cannot write too few or too many lines, a long line, a symbol or an emoji;
 * it only chooses the words in the middle.
 */
export function poemGrammar(ends: string[]): string {
  const rules = ends.map((end, i) => `line${i} ::= word (" " word){3,8} " ${end}" "\\n"`);
  return [`root ::= ${ends.map((_, i) => `line${i}`).join(' ')}`, ...rules, 'word ::= [A-Za-z\']{1,11}'].join('\n');
}
