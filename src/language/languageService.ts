/**
 * The language course: which units are open, getting each unit's words in the chosen language,
 * and recording finished lessons (stars, XP, daily streak). Screens read useLanguage and call this.
 */
import { PHRASE_LANGUAGES, PHRASES_EN } from '../phrases/data';
import { ensureTextModel } from '../atlasTools/models';
import { parseJsonLoose, str } from '../study/games/json';
import { UNITS, unitById } from './curriculum';
import { starsFor, type Item } from './lessons';
import { knownSet, newWords, parseListening, type Listening, type Word } from './listening';
import { useLanguage } from './store';
import { LANGUAGE_PROJECT_ID, languageProjectDescription, tutorPrompt } from './tutor';

/** The personal unit made from words saved in stories and podcasts. */
export const MY_WORDS = 'mine';

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
  /**
   * Switches the course to another language. The Learn a language project's chats follow it,
   * unless the user wrote their own instructions for that project.
   */
  setLanguage(code: string): void {
    useLanguage.setState({ language: code });
    const { useProjectStore } = require('../stores/projectStore');
    const project = useProjectStore.getState().getProject(LANGUAGE_PROJECT_ID);
    if (!project || project.pinVerifier) return;
    const generated = PHRASE_LANGUAGES.some((l) => project.systemPrompt === tutorPrompt(l.name));
    const autoDescription = PHRASE_LANGUAGES.some((l) => project.description === languageProjectDescription(l.name));
    useProjectStore.getState().updateProject(LANGUAGE_PROJECT_ID, {
      ...(generated ? { systemPrompt: tutorPrompt(langName(code)) } : {}),
      ...(autoDescription ? { description: languageProjectDescription(langName(code)) } : {}),
    });
  },

  /** A unit opens when the one before it has at least one star. My words is open once it has words. */
  unlocked(unitId: string, code = useLanguage.getState().language): boolean {
    if (unitId === MY_WORDS) return (useLanguage.getState().myWords[code]?.length ?? 0) >= 4;
    const i = UNITS.findIndex((u) => u.id === unitId);
    if (i <= 0) return true;
    return (useLanguage.getState().progress[code]?.[UNITS[i - 1].id]?.stars ?? 0) > 0;
  },

  /** True when the unit's words came from the model rather than the built-in phrase cards. */
  isAiMade: (unitId: string) => unitId !== MY_WORDS && !unitById(unitId)?.builtIn,

  /** The unit's words in the chosen language: built in, kept from before, or written now. */
  async unitWords(unitId: string, onStep: (m: string) => void = () => undefined): Promise<Item[]> {
    const { language: code, content, myWords } = useLanguage.getState();
    if (unitId === MY_WORDS) return myWords[code] ?? [];
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

  /** Every word the learner has met: finished units and saved words. */
  knownItems(code = useLanguage.getState().language): Item[] {
    const { content, progress, myWords } = useLanguage.getState();
    const done = UNITS.filter((u) => (progress[code]?.[u.id]?.stars ?? 0) > 0);
    return [...done.flatMap((u) => content[code]?.[u.id] ?? []), ...(myWords[code] ?? [])];
  },

  /**
   * Writes a short story or two-person podcast in simple words, with a question after each
   * part and the new words in it. Kept, newest first.
   */
  async makeListening(kind: Listening['kind'], topic: string, onStep: (m: string) => void = () => undefined): Promise<Listening> {
    const code = useLanguage.getState().language;
    const name = langName(code);
    onStep('Loading the language model...');
    await ensureTextModel(null);
    const { llmService } = require('../services/llm');
    if (llmService.isCurrentlyGenerating()) throw new Error('The model is busy with a chat. Try again in a moment.');
    const known = languageService.knownItems(code);
    const knownList = known.slice(0, 80).map((x) => x.t).join(', ');
    onStep(kind === 'story' ? `Writing a short story in ${name}...` : `Writing a short podcast in ${name}...`);
    const shape = kind === 'story'
      ? '{"title": "...", "parts": [{"lines": [{"t": "two or three short sentences in TARGET", "en": "English"}], "question": {"q": "a simple question in English about this part", "options": ["...", "...", "..."], "answer": 0}}], "vocab": [{"t": "word in TARGET", "en": "meaning"}]}'
      : '{"title": "...", "parts": [{"lines": [{"speaker": "Ana", "t": "one short sentence in TARGET", "en": "English"}, {"speaker": "Leo", "t": "...", "en": "..."}], "question": {"q": "a simple question in English", "options": ["...", "...", "..."], "answer": 1}}], "vocab": [{"t": "word in TARGET", "en": "meaning"}]}';
    const raw: string = await llmService.generateResponse([
      { id: 's', role: 'system', content: `You write very easy ${name} for beginners: short sentences, present tense, common everyday words.`, timestamp: 0 },
      { id: 'u', role: 'user', content: `Write a ${kind === 'story' ? 'short story' : 'short podcast conversation between two friends, Ana and Leo,'} in ${name}${topic.trim() ? ` about ${topic.trim()}` : ''}, in 4 parts.
${knownList ? `The learner knows these words; use them often: ${knownList}.
` : ''}After each part ask one easy question about it. Then list up to 10 words from it that are NOT in the known list, with their English meaning.
Reply with ONLY JSON like this (TARGET = ${name}):
${shape}`, timestamp: 0 },
    ], { disableThinking: true });
    const piece = parseListening(raw, kind, knownSet(known));
    if (!piece) throw new Error('The model did not write it in the expected format. Try again, or use a bigger model.');
    useLanguage.setState((s) => ({ listening: { ...s.listening, [code]: [piece, ...(s.listening[code] ?? [])].slice(0, 20) } }));
    return piece;
  },

  /** Saves words to My words (skips ones already there or already known). */
  saveWords(words: Word[]): number {
    const code = useLanguage.getState().language;
    const fresh = newWords(words, knownSet(languageService.knownItems(code)));
    if (!fresh.length) return 0;
    useLanguage.setState((s) => ({ myWords: { ...s.myWords, [code]: [...(s.myWords[code] ?? []), ...fresh.map((w) => ({ en: w.en, t: w.t }))] } }));
    return fresh.length;
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
