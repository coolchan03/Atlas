/**
 * The language course: levels and which units are open, getting each unit's words in the
 * chosen language (taught the way teaching.ts describes), stories and podcasts, spaced review,
 * and recording finished lessons (stars, XP, daily streak). Screens read useLanguage and call this.
 */
import { PHRASE_LANGUAGES, PHRASES_EN } from '../phrases/data';
import { ensureTextModel, forceLoadTextModel } from '../atlasTools/models';
import { parseJsonLoose, str } from '../study/games/json';
import { UNITS, unitById, type Unit } from './curriculum';
import { listeningPrompt, needsRomanization, parseUnitLesson, unitPrompt, vocabPrompt } from './coursePrompts';
import { starsFor, type Item } from './lessons';
import { knownSet, newWords, parseListening, type Listening, type Word } from './listening';
import { dueItems, remember } from './review';
import { useLanguage, type SavedLesson } from './store';
import { boardFor, lessonKey, spaceOpen, unitDone } from './board';
import { secondsFor, updatePace, type ExerciseKind } from './pace';
import { levelGuide, methodFor, type LevelId } from './teaching';
import { LANGUAGE_PROJECT_ID, isGeneratedTutorPrompt, languageProjectDescription, tutorPrompt } from './tutor';

/** The personal unit made from words saved in stories and podcasts. */
export const MY_WORDS = 'mine';
/** A lesson of words due for spaced review, from every unit studied. */
export const REVIEW = 'review';
/** Practice that earns XP but no board progress (a speed round outside the board). */
export const PRACTICE = 'practice';

export const LANGUAGES = PHRASE_LANGUAGES.map(({ code, name, native }) => ({ code, name, native }));
const langName = (code: string) => PHRASE_LANGUAGES.find((l) => l.code === code)?.name ?? code;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Checks the model's translations: one per item, in order, not just the English copied back. */
export function parseUnitWords(raw: string, english: string[], code: string): Item[] | null {
  const data = parseJsonLoose<any>(raw);
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  if (list.length < english.length) return null;
  const items = english.map((en, i) => {
    const t = str(list[i]?.t ?? list[i]?.translation, 120);
    const r = needsRomanization(code) ? str(list[i]?.r ?? list[i]?.romanization, 120) : '';
    return { en, t, ...(r ? { r } : {}) };
  });
  const copied = items.filter((x) => x.t.toLowerCase() === x.en.toLowerCase()).length;
  return items.every((x) => x.t) && copied <= 1 ? items : null;
}

async function model(): Promise<any> {
  await ensureTextModel(null);
  const { llmService } = require('../services/llm');
  if (llmService.isCurrentlyGenerating()) throw new Error('The model is busy with a chat. Try again in a moment.');
  return llmService;
}

/** A word as looked up: lower case, no punctuation around it. */
export const plainWord = (w: string) => w.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** A meaning the phone already has: single-word lesson items, saved words, story word lists. */
function localMeaning(w: string, code: string): string {
  const st = useLanguage.getState();
  const pools: { t: string; en: string }[][] = [
    ...Object.values(st.content[code] ?? {}), st.myWords[code] ?? [],
    ...(st.listening[code] ?? []).map((l) => l.vocab),
  ];
  for (const pool of pools) {
    const hit = pool.find((x) => plainWord(x.t) === w);
    if (hit) return hit.en;
  }
  return '';
}

function builtInWords(unit: Unit, code: string): Item[] {
  const lang = PHRASE_LANGUAGES.find((l) => l.code === code);
  return unit.items.map((en) => {
    const p = lang?.phrases[PHRASES_EN.indexOf(en)];
    return { en, t: p?.[0] ?? '', ...(p?.[1] ? { r: p[1] } : {}) };
  }).filter((x) => x.t);
}

/** Keeps the Learn a language project's chats on the course's language and level (unless the user wrote their own). */
function syncProject(): void {
  const { language: code, level } = useLanguage.getState();
  const { useProjectStore } = require('../stores/projectStore');
  const project = useProjectStore.getState().getProject(LANGUAGE_PROJECT_ID);
  if (!project || project.pinVerifier) return;
  const autoDescription = PHRASE_LANGUAGES.some((l) => project.description === languageProjectDescription(l.name));
  useProjectStore.getState().updateProject(LANGUAGE_PROJECT_ID, {
    ...(isGeneratedTutorPrompt(project.systemPrompt) ? { systemPrompt: tutorPrompt(langName(code), level) } : {}),
    ...(autoDescription ? { description: languageProjectDescription(langName(code)) } : {}),
  });
}

export const languageService = {
  /** Switches the course to another language; the project's practice chats follow. */
  setLanguage(code: string): void {
    useLanguage.setState({ language: code });
    syncProject();
  },

  /** Picks the level to work at (1 Basic .. 4 Fluent); stories, podcasts and chats follow it. */
  setLevel(level: LevelId): void {
    useLanguage.setState({ level });
    syncProject();
  },

  /** True when a board space (lesson part, story, podcast or speed round) has been done. */
  isDone(key: string, code = useLanguage.getState().language): boolean {
    return (useLanguage.getState().progress[code]?.[key]?.stars ?? 0) > 0;
  },

  /**
   * My words opens once it has words and Review once words are due. A unit is open when its
   * first board space is: the first space of every level is open (so a learner who knows some
   * can start higher), and after that a space opens when the one before it is done.
   */
  unlocked(unitId: string, code = useLanguage.getState().language): boolean {
    const st = useLanguage.getState();
    if (unitId === MY_WORDS) return (st.myWords[code]?.length ?? 0) >= 4;
    if (unitId === REVIEW) return languageService.dueCount(code) >= 4;
    const unit = unitById(unitId);
    if (!unit) return false;
    const spaces = boardFor(unit.level);
    return spaceOpen(spaces, spaces.findIndex((s) => s.unitId === unitId), (k) => languageService.isDone(k, code));
  },

  /** Marks a story, podcast or speed-round space as done (stars and XP come from lessons). */
  completeSpace(key: string): void {
    const { language: code, progress } = useLanguage.getState();
    const prev = progress[code]?.[key] ?? { stars: 0, lessons: 0 };
    useLanguage.setState({ progress: { ...progress, [code]: { ...progress[code], [key]: { stars: Math.max(1, prev.stars), lessons: prev.lessons + 1 } } } });
  },

  setSounds(on: boolean): void { useLanguage.setState({ sounds: on }); },

  /** Loads the AI model even when something else holds the memory (frees other models first). */
  async forceLoadModel(onStep: (m: string) => void = () => undefined): Promise<void> {
    await forceLoadTextModel(onStep);
  },

  /**
   * The English meaning of one word (tap a word to see it). Words from lessons, saved words
   * and stories are known already; anything else is asked of the model once and kept.
   */
  async lookupWord(word: string): Promise<string> {
    const st = useLanguage.getState();
    const code = st.language;
    const w = plainWord(word);
    if (!w) return '';
    const cached = st.glossary[code]?.[w];
    if (cached) return cached;
    const local = localMeaning(w, code);
    if (local) return local;
    const llm = await model();
    const raw: string = await llm.generateResponse([
      { id: 's', role: 'system', content: `You are a ${langName(code)}-English dictionary. Reply with only the short English meaning, nothing else.`, timestamp: 0 },
      { id: 'u', role: 'user', content: `${langName(code)} word: ${word}`, timestamp: 0 },
    ], { disableThinking: true });
    const meaning = str(raw.replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map((l) => l.trim()).filter(Boolean)[0], 80);
    if (meaning) useLanguage.setState((s) => ({ glossary: { ...s.glossary, [code]: { ...s.glossary[code], [w]: meaning } } }));
    return meaning;
  },

  /** Answers the learner's question about the exercise in front of them, at their level. */
  async askTutor(question: string, context: string): Promise<string> {
    const { language: code, level } = useLanguage.getState();
    const llm = await model();
    const raw: string = await llm.generateResponse([
      { id: 's', role: 'system', content: `You are a friendly ${langName(code)} tutor helping during a lesson. ${methodFor(levelGuide(level), langName(code))} Explain in simple English in three sentences or fewer, with one short example. Do not just give away an answer the learner has not tried yet: give a hint first.`, timestamp: 0 },
      { id: 'u', role: 'user', content: `${context}\n\nMy question: ${question}`, timestamp: 0 },
    ], { disableThinking: true });
    return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  },

  /** Seconds the learner took on one exercise, to size later lessons to their pace. */
  recordPace(kind: ExerciseKind, seconds: number): void {
    useLanguage.setState((s) => ({ pace: { ...s.pace, [kind]: updatePace(s.pace[kind], seconds) } }));
  },

  /** Seconds to plan for an exercise of this kind (the learner's own pace once known). */
  secondsOf: (kind: ExerciseKind): number => secondsFor(kind, useLanguage.getState().pace),

  /** The unfinished lesson for a space, if there is one (so it carries on where it stopped). */
  savedLesson(key: string): SavedLesson | undefined {
    const st = useLanguage.getState();
    const s = st.saved[st.language];
    return s && s.key === key ? s : undefined;
  },

  /** Keeps the lesson in progress (or clears it with null) so leaving and coming back loses nothing. */
  saveLesson(lesson: Omit<SavedLesson, 'savedAt'> | null): void {
    const code = useLanguage.getState().language;
    useLanguage.setState((s) => ({ saved: { ...s.saved, [code]: lesson ? { ...lesson, savedAt: Date.now() } : undefined } }));
  },

  /** True when the unit's words came from the model rather than the built-in phrase cards. */
  isAiMade: (unitId: string) => unitId !== MY_WORDS && unitId !== REVIEW && !unitById(unitId)?.builtIn,

  /** The grammar rule or theme note for a unit, once its words are written. */
  tipFor: (unitId: string): string => useLanguage.getState().tips[useLanguage.getState().language]?.[unitId] ?? '',

  /** The unit's words in the chosen language: built in, kept from before, or written now. */
  async unitWords(unitId: string, onStep: (m: string) => void = () => undefined): Promise<Item[]> {
    const { language: code, content, myWords, memory } = useLanguage.getState();
    if (unitId === MY_WORDS) return myWords[code] ?? [];
    if (unitId === REVIEW) return dueItems(languageService.studiedItems(code), memory[code] ?? {}, { n: 10 });
    const unit = unitById(unitId);
    if (!unit) throw new Error('Unknown unit.');
    if (unit.builtIn) return builtInWords(unit, code);
    const kept = content[code]?.[unitId];
    if (kept?.length) return kept;
    onStep('Loading the language model...');
    const llm = await model();
    const name = langName(code);
    const level = levelGuide(unit.level);
    onStep(`Writing the ${unit.title} lesson in ${name}...`);
    let items: Item[] | null = null;
    let tip = '';
    if (unit.items.length) {
      const ask = (extra = '') => llm.generateResponse(vocabPrompt({ unit, language: name, level, code, extra }), { disableThinking: true });
      items = parseUnitWords(await ask(), unit.items, code)
        ?? parseUnitWords(await ask(' Translate every item; do not copy the English.'), unit.items, code);
    } else {
      const known = languageService.knownItems(code).map((x) => x.t);
      for (let attempt = 0; attempt < 2 && !items; attempt++) {
        const got = parseUnitLesson(await llm.generateResponse(unitPrompt({ unit, language: name, level, code, known }), { disableThinking: true }), level, code);
        if (got) { items = got.items; tip = got.tip; }
      }
    }
    if (!items) throw new Error('The model did not write a usable lesson. Try again, or use a bigger model.');
    useLanguage.setState((s) => ({
      content: { ...s.content, [code]: { ...s.content[code], [unitId]: items! } },
      tips: tip ? { ...s.tips, [code]: { ...s.tips[code], [unitId]: tip } } : s.tips,
    }));
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
    const { content, myWords } = useLanguage.getState();
    const done = UNITS.filter((u) => unitDone(u, (k) => languageService.isDone(k, code)));
    return [...done.flatMap((u) => (u.builtIn ? builtInWords(u, code) : content[code]?.[u.id] ?? [])), ...(myWords[code] ?? [])];
  },

  /** Items from every unit the learner has practised at least once (for review). */
  studiedItems(code = useLanguage.getState().language): Item[] {
    const { content, progress, myWords } = useLanguage.getState();
    const studied = UNITS.filter((u) => (progress[code]?.[lessonKey(u.id, 1)]?.lessons ?? 0) > 0);
    return [...studied.flatMap((u) => (u.builtIn ? builtInWords(u, code) : content[code]?.[u.id] ?? [])), ...(myWords[code] ?? [])];
  },

  /** How many words are due for review now. */
  dueCount(code = useLanguage.getState().language): number {
    return dueItems(languageService.studiedItems(code), useLanguage.getState().memory[code] ?? {}, { n: 1000 }).length;
  },

  /** Writes a story or two-person podcast at the learner's level, with questions and its new words. Kept, newest first. */
  async makeListening(kind: Listening['kind'], topic: string, onStep: (m: string) => void = () => undefined): Promise<Listening> {
    const { language: code, level } = useLanguage.getState();
    const name = langName(code);
    onStep('Loading the language model...');
    const llm = await model();
    const known = languageService.knownItems(code);
    onStep(kind === 'story' ? `Writing a story in ${name}...` : `Writing a podcast in ${name}...`);
    const raw: string = await llm.generateResponse(
      listeningPrompt({ kind, language: name, level: levelGuide(level), topic, known: known.map((x) => x.t) }), { disableThinking: true });
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

  /**
   * Records a finished lesson: best stars, XP for right answers, the daily streak, and each
   * word's spaced-repetition box (`results`: the word in the language and whether it was right).
   */
  finishLesson(unitId: string, { right, total, results = [] }: { right: number; total: number; results?: { t: string; right: boolean }[] }): { stars: number; xp: number; streak: number } {
    const { language: code, progress, xp, streak, memory } = useLanguage.getState();
    const stars = starsFor(right, total);
    const prev = progress[code]?.[unitId] ?? { stars: 0, lessons: 0 };
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 864e5));
    const nextStreak = streak.day === today ? streak : { day: today, count: streak.day === yesterday ? streak.count + 1 : 1 };
    const gained = right * 10;
    const mem = { ...memory[code] };
    for (const r of results) mem[r.t] = remember(mem[r.t], r.right);
    useLanguage.setState({
      progress: unitId === REVIEW || unitId === PRACTICE ? progress : { ...progress, [code]: { ...progress[code], [unitId]: { stars: Math.max(prev.stars, stars), lessons: prev.lessons + 1 } } },
      xp: xp + gained,
      streak: nextStreak,
      memory: { ...memory, [code]: mem },
    });
    return { stars, xp: gained, streak: nextStreak.count };
  },
};
