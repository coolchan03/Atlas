/** Pools of words the course draws on: a unit's own, the built-in phrases, a level's, an exam's, and the word of the day. */
import { PHRASE_LANGUAGES, PHRASES_EN } from '../phrases/data';
import { unitById, unitsForLevel, type Unit } from './curriculum';
import { boardFor } from './board';
import type { Item } from './lessons';
import type { LevelId } from './teaching';
import { useLanguage } from './store';

export function builtInWords(unit: Unit, code: string): Item[] {
  const lang = PHRASE_LANGUAGES.find((l) => l.code === code);
  return unit.items.map((en) => {
    const p = lang?.phrases[PHRASES_EN.indexOf(en)];
    return { en, t: p?.[0] ?? '', ...(p?.[1] ? { r: p[1] } : {}) };
  }).filter((x) => x.t);
}

const wordsOf = (units: Unit[], code: string): Item[] => {
  const { content } = useLanguage.getState();
  return units.flatMap((u) => (u.builtIn ? builtInWords(u, code) : content[code]?.[u.id] ?? []));
};

/** A short word or phrase, the same all day, from the current level's lessons and the built-in phrases. */
export function wordOfTheDayFor(date: Date): Item | null {
  const { language: code, level, content } = useLanguage.getState();
  const lang = PHRASE_LANGUAGES.find((l) => l.code === code);
  const builtIn = PHRASES_EN.map((en, i) => ({ en, t: lang?.phrases[i]?.[0] ?? '', ...(lang?.phrases[i]?.[1] ? { r: lang.phrases[i][1] } : {}) }));
  const written = unitsForLevel(level).flatMap((u) => (u.builtIn ? [] : content[code]?.[u.id] ?? []));
  const pool = [...written, ...builtIn].filter((x, i, all) => x.t && x.t.split(/\s+/).length <= 3 && all.findIndex((y) => y.t === x.t) === i);
  if (!pool.length) return null;
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  return pool[(day * 7919) % pool.length];
}

export function levelWordsFor(level: LevelId, code: string): Item[] {
  const words = wordsOf(unitsForLevel(level), code);
  if (words.length < 6) throw new Error('Do this level\'s lessons first: the checkpoint tests all of them.');
  return words;
}

export function examWordsFor(level: LevelId, examKey: string | undefined, code: string): Item[] {
  const spaces = boardFor(level);
  const at = Math.max(0, spaces.findIndex((s) => s.key === examKey));
  let from = at;
  while (from > 0 && spaces[from - 1].kind !== 'exam') from--;
  const units = [...new Set(spaces.slice(from, at).filter((s) => s.kind === 'lesson' && s.unitId).map((s) => s.unitId!))]
    .map((id) => unitById(id)).filter((u): u is Unit => !!u);
  const words = wordsOf(units, code);
  if (words.length < 6) throw new Error('Do the lessons before this exam first: it tests them.');
  return words;
}
