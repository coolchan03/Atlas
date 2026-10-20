/**
 * The language course: which units are open, getting each unit's words in the chosen language,
 * and recording finished lessons (stars, XP, daily streak). Screens read useLanguage and call this.
 */
import { PHRASE_LANGUAGES, PHRASES_EN } from '../phrases/data';
import { ensureTextModel } from '../atlasTools/models';
import { parseJsonLoose, str } from '../study/games/json';
import { UNITS, unitById } from './curriculum';
import { starsFor, type Item } from './lessons';
import { useLanguage } from './store';

export const LANGUAGES = PHRASE_LANGUAGES.map(({ code, name, native }) => ({ code, name, native }));
const langName = (code: string) => PHRASE_LANGUAGES.find((l) => l.code === code)?.name ?? code;
const NON_LATIN = /^(ja|zh|ko|ar|hi|ru|uk|el|th|he)/;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Checks the model's translations: one per item, in order, not just the English copied back. */
export function parseUnitWords(raw: string, english: string[], code: string): Item[] | null {
  const data = parseJsonLoose<any>(raw);
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  if (list.length < english.length) return null;
  const items = english.map((en, i) => {
    const t = str(list[i]?.t ?? list[i]?.translation, 120);
    const r = NON_LATIN.test(code) ? str(list[i]?.r ?? list[i]?.romanization, 120) : '';
    return { en, t, ...(r ? { r } : {}) };
  });
  const copied = items.filter((x) => x.t.toLowerCase() === x.en.toLowerCase()).length;
  return items.every((x) => x.t) && copied <= 1 ? items : null;
}

export const languageService = {
  setLanguage(code: string): void { useLanguage.setState({ language: code }); },

  /** A unit opens when the one before it has at least one star. */
  unlocked(unitId: string, code = useLanguage.getState().language): boolean {
    const i = UNITS.findIndex((u) => u.id === unitId);
    if (i <= 0) return true;
    return (useLanguage.getState().progress[code]?.[UNITS[i - 1].id]?.stars ?? 0) > 0;
  },

  /** True when the unit's words came from the model rather than the built-in phrase cards. */
  isAiMade: (unitId: string) => !unitById(unitId)?.builtIn,

  /** The unit's words in the chosen language: built in, kept from before, or written now. */
  async unitWords(unitId: string, onStep: (m: string) => void = () => undefined): Promise<Item[]> {
    const { language: code, content } = useLanguage.getState();
    const unit = unitById(unitId);
    if (!unit) throw new Error('Unknown unit.');
    const lang = PHRASE_LANGUAGES.find((l) => l.code === code);
    if (unit.builtIn && lang) {
      return unit.items.map((en) => {
        const p = lang.phrases[PHRASES_EN.indexOf(en)];
        return { en, t: p?.[0] ?? '', ...(p?.[1] ? { r: p[1] } : {}) };
      }).filter((x) => x.t);
    }
    const kept = content[code]?.[unitId];
    if (kept?.length) return kept;
    onStep('Loading the language model...');
    await ensureTextModel(null);
    const { llmService } = require('../services/llm');
    if (llmService.isCurrentlyGenerating()) throw new Error('The model is busy with a chat. Try again in a moment.');
    onStep(`Writing the ${unit.title} words in ${langName(code)}...`);
    const roman = NON_LATIN.test(code) ? ', "r": pronunciation in Latin letters' : '';
    const ask = (extra = '') => llmService.generateResponse([
      { id: 's', role: 'system', content: `You are a careful ${langName(code)} teacher. Translate exactly, using the most common everyday wording.`, timestamp: 0 },
      { id: 'u', role: 'user', content: `Translate each English item into ${langName(code)}.${extra}\nReply with ONLY a JSON array, one object per item in the same order: {"en": English, "t": ${langName(code)} translation${roman}}.\n${unit.items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`, timestamp: 0 },
    ], { disableThinking: true });
    let items = parseUnitWords(await ask(), unit.items, code);
    if (!items) items = parseUnitWords(await ask(' Translate every item; do not copy the English.'), unit.items, code);
    if (!items) throw new Error('The model did not give usable translations. Try again, or use a bigger model.');
    useLanguage.setState((s) => ({ content: { ...s.content, [code]: { ...s.content[code], [unitId]: items! } } }));
    return items;
  },

  /** Forget a unit's words so the model writes them again (for a bad translation). */
  rewrite(unitId: string): void {
    const code = useLanguage.getState().language;
    useLanguage.setState((s) => {
      const forLang = { ...s.content[code] };
      delete forLang[unitId];
      return { content: { ...s.content, [code]: forLang } };
    });
  },

  /** Records a finished lesson: best stars, XP for right answers, and the daily streak. */
  finishLesson(unitId: string, right: number, total: number): { stars: number; xp: number; streak: number } {
    const { language: code, progress, xp, streak } = useLanguage.getState();
    const stars = starsFor(right, total);
    const prev = progress[code]?.[unitId] ?? { stars: 0, lessons: 0 };
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 864e5));
    const nextStreak = streak.day === today ? streak : { day: today, count: streak.day === yesterday ? streak.count + 1 : 1 };
    const gained = right * 10;
    useLanguage.setState({
      progress: { ...progress, [code]: { ...progress[code], [unitId]: { stars: Math.max(prev.stars, stars), lessons: prev.lessons + 1 } } },
      xp: xp + gained,
      streak: nextStreak,
    });
    return { stars, xp: gained, streak: nextStreak.count };
  },
};
