/**
 * The second set of instructions for a subject or project: how to use each document. The person writes it in plain words ("take only the
 * general rules from the Handbook; read all of the 2024 Code; the Memo is the most up to date"), and CODE reads it, so a small model never
 * has to work out which file is meant: each sentence that names a document gives that document one use (the newest, the general rules only,
 * all of it, or leave it out). The whole text also goes to the AI as written.
 */
import type { AuthoritySource } from './authority';

type GuideUse = 'newest' | 'general' | 'all' | 'skip';
export interface GuideEntry { name: string; use: GuideUse }

const USES: Array<[GuideUse, RegExp]> = [
  ['skip', /\b(ignore|skip|leave out|do not use|don'?t use|never use|outdated|obsolete|disregard)\b/i],
  ['newest', /\b(most up[- ]?to[- ]?date|newest|latest|most recent|current|supersedes?|replaces?|overrides?|wins?)\b/i],
  ['general', /\b(general rules?|general principles?|overview|background|just the rules|only the rules|basics|main ideas|skim|gist)\b/i],
  ['all', /\b(all of|everything|entire|whole|every detail|in full|read all|each section)\b/i],
];
const LABEL: Record<GuideUse, string> = {
  newest: 'you were told this is the most up to date, so it replaces the others where they differ',
  general: 'you were told to take only its general rules',
  all: 'you were told to read all of it',
  skip: 'you were told to leave it out',
};

const plain = (s: string): string => s.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** True when the sentence names the document: its whole plain name appears, or (for a longer name) most of its words. */
function mentions(sentence: string, name: string): boolean {
  const stem = plain(name);
  if (stem.length < 3) return false;
  const text = ` ${plain(sentence)} `;
  if (text.includes(` ${stem} `)) return true;
  // People leave the year or edition off a name they know well ("the Tax Handbook"): the name without its numbers counts when it is still two words or more.
  const bare = stem.split(' ').filter((w) => !/^\d+$/.test(w)).join(' ');
  if (bare !== stem && bare.includes(' ') && text.includes(` ${bare} `)) return true;
  const words = stem.split(' ').filter((w) => w.length > 2);
  return words.length >= 3 && words.filter((w) => text.includes(` ${w} `)).length / words.length >= 0.7;
}

/** What each sentence of the guide says about each of the named documents. A document in several sentences keeps the strongest use (skip, then newest, general, all). */
export function readGuide(guide: string | undefined, names: string[]): GuideEntry[] {
  if (!guide?.trim()) return [];
  const order: GuideUse[] = ['skip', 'newest', 'general', 'all'];
  const found = new Map<string, GuideUse>();
  for (const sentence of guide.split(/[\n;]+|\.(?=\s|$)/).map((s) => s.trim()).filter(Boolean)) {
    const use = USES.find(([, re]) => re.test(sentence))?.[0];
    if (!use) continue;
    for (const name of names.filter((n) => mentions(sentence, n))) {
      const before = found.get(name);
      if (!before || order.indexOf(use) < order.indexOf(before)) found.set(name, use);
    }
  }
  return [...found].map(([name, use]) => ({ name, use }));
}

/** The label for a document's excerpt, or '' when the guide says nothing about it. */
export const guideLabel = (entries: GuideEntry[], name: string): string => {
  const use = entries.find((e) => e.name === name)?.use;
  return use ? `your guide: ${LABEL[use]}` : '';
};

/** Documents the guide says to leave out. */
export const guideSkips = (entries: GuideEntry[]): Set<string> => new Set(entries.filter((e) => e.use === 'skip').map((e) => e.name));

/** The prompt text: the guide as written, with what the code understood from it. */
export function guideText(guide: string | undefined, entries: GuideEntry[]): string {
  const g = guide?.trim();
  if (!g) return '';
  const read = entries.map((e) => `${e.name}: ${LABEL[e.use]}`).join('; ');
  return `How the user told you to use their documents (follow it): ${g.slice(0, 1500)}${read ? ` In short: ${read}.` : ''}`;
}

/** True when the guide makes one set of sources win over another: a document it calls the newest against ones it does not. Null when the guide does not decide. */
export function guideOverrules(entries: GuideEntry[], newer: AuthoritySource[], older: AuthoritySource[]): boolean | null {
  const newest = new Set(entries.filter((e) => e.use === 'newest').map((e) => e.name));
  if (!newest.size) return null;
  const has = (list: AuthoritySource[]) => list.some((s) => newest.has(s.title ?? ''));
  if (has(newer) && !has(older)) return true;
  if (has(older) && !has(newer)) return false;
  return null;
}
