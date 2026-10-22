/**
 * The language course: levels and which units are open, getting each unit's words in the
 * chosen language (taught the way teaching.ts describes), stories and podcasts, spaced review,
 * and recording finished lessons (stars, XP, daily streak). Screens read useLanguage and call this.
 */
import { PHRASE_LANGUAGES, PHRASES_EN } from '../phrases/data';
import { ensureTextModel, forceLoadTextModel } from '../atlasTools/models';
import { parseJsonLoose, str } from '../study/games/json';
import { UNITS, unitById, unitsForLevel, type Unit } from './curriculum';
import { listeningPrompt, needsRomanization, parseUnitLesson, unitPrompt, vocabPrompt } from './coursePrompts';
import { starsFor, type Item } from './lessons';
import { knownSet, newWords, parseListening, type Listening, type Word } from './listening';
import { REAL_NEWS, pieceById, pieceForSpace } from './library';
import { writtenPiece } from './libraryEs';
import { dueItems, remember } from './review';
import { useLanguage, usePrepareLive, type SavedLesson } from './store';
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
/** Daily XP goals to pick from (10 XP per right answer: one lesson is about 100). */
export const DAILY_GOALS = [50, 100, 200, 300];

export const LANGUAGES = PHRASE_LANGUAGES.map(({ code, name, native }) => ({ code, name, native }));
const langName = (code: string) => PHRASE_LANGUAGES.find((l) => l.code === code)?.name ?? code;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Keeps the last 90 days of history. */
const keepDays = (h: Record<string, { xp: number; lessons: number }>) => {
  const cutoff = Date.now() - 90 * 864e5;
  const time = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  return Object.fromEntries(Object.entries(h).filter(([d]) => time(d) >= cutoff));
};

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

function keepListening(code: string, piece: Listening): void {
  useLanguage.setState((s) => ({
    listening: { ...s.listening, [code]: [piece, ...(s.listening[code] ?? []).filter((l) => !piece.pieceId || l.pieceId !== piece.pieceId)].slice(0, 60) },
  }));
}

async function writeListening(o: { kind: Listening['kind']; topic: string; outline?: string; pieceId?: string }, onStep: (m: string) => void): Promise<Listening> {
  const { language: code, level } = useLanguage.getState();
  const name = langName(code);
  onStep('Loading the language model...');
  const llm = await model();
  const known = languageService.knownItems(code);
  onStep(o.kind === 'story' ? `Writing a story in ${name}...` : `Writing a podcast in ${name}...`);
  const raw: string = await llm.generateResponse(
    listeningPrompt({ kind: o.kind, language: name, level: levelGuide(level), topic: o.topic, known: known.map((x) => x.t), outline: o.outline }), { disableThinking: true });
  const parsed = parseListening(raw, o.kind, knownSet(known));
  if (!parsed) throw new Error('The model did not write it in the expected format. Try again, or use a bigger model.');
  const piece: Listening = o.pieceId ? { ...parsed, pieceId: o.pieceId } : parsed;
  keepListening(code, piece);
  return piece;
}

let preparing: { stop: boolean } | null = null;

export const languageService = {
  /** Switches the course to another language; the project's practice chats follow. */
  setLanguage(code: string): void {
    useLanguage.setState({ language: code });
    syncProject();
  },

  /** Picks the level to work at (1 = A1 Beginner .. 6 = C2 Proficient); stories, podcasts and chats follow it. */
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

  /**
   * What "Prepare this level" still has to write: units without words, and the board's
   * pre-made stories and podcasts not yet written in this language.
   */
  levelToPrepare(level: LevelId, code = useLanguage.getState().language): { units: Unit[]; pieces: string[] } {
    const { content, listening } = useLanguage.getState();
    const units = unitsForLevel(level).filter((u) => !u.builtIn && !content[code]?.[u.id]?.length);
    const pieces = [...new Set(boardFor(level).filter((x) => x.kind === 'story' || x.kind === 'podcast')
      .map((x) => pieceForSpace(level, x.key)?.id).filter((id): id is string => !!id))]
      .filter((id) => !writtenPiece(id, code) && !listening[code]?.some((l) => l.pieceId === id));
    return { units, pieces };
  },

  /**
   * Writes everything a level needs with the AI on the phone, one after another, so the whole
   * level then works offline with no waiting. Stops early with stopPreparing(); a unit that
   * fails is skipped and written again when it is opened.
   */
  async prepareLevel(level: LevelId): Promise<void> {
    if (usePrepareLive.getState().level !== null) return;
    const { units, pieces } = languageService.levelToPrepare(level);
    const total = units.length + pieces.length;
    preparing = { stop: false };
    const job = preparing;
    usePrepareLive.setState({ level, done: 0, total, step: 'Loading the language model...', error: null });
    let failed = 0;
    try {
      const tasks: [string, () => Promise<unknown>][] = [
        ...units.map((u): [string, () => Promise<unknown>] => [u.title, () => languageService.unitWords(u.id)]),
        ...pieces.map((id): [string, () => Promise<unknown>] => [pieceById(id)?.title ?? id, () => languageService.openPremade(id)]),
      ];
      for (const [title, run] of tasks) {
        if (job.stop) break;
        usePrepareLive.setState({ step: `Writing ${title}` });
        try { await run(); } catch (e: any) {
          failed++;
          // No model at all: nothing else will work either.
          if (/model/i.test(String(e?.message)) && /download|load|busy/i.test(String(e?.message))) throw e;
        }
        usePrepareLive.setState((st) => ({ done: st.done + 1 }));
      }
      usePrepareLive.setState({ level: null, step: '', error: failed ? `${failed} could not be written; they are written when opened.` : null });
    } catch (e: any) {
      usePrepareLive.setState({ level: null, step: '', error: String(e?.message || e) });
    } finally { preparing = null; }
  },

  /** Stops "Prepare this level" after the piece it is writing. */
  stopPreparing(): void { if (preparing) preparing.stop = true; },

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

  /** The last seven days, oldest first, for the weekly chart. */
  week(now = new Date()): { day: string; label: string; xp: number; lessons: number; today: boolean }[] {
    const history = useLanguage.getState().history ?? {};
    return Array.from({ length: 7 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - k));
      const key = dayKey(d);
      return { day: key, label: WEEKDAYS[d.getDay()], xp: history[key]?.xp ?? 0, lessons: history[key]?.lessons ?? 0, today: k === 6 };
    });
  },

  /**
   * Every word learned so far (lessons finished, and My words), with how well it is known
   * (Leitner box 1-5, 0 = not practised yet) and when it is next due for review.
   */
  wordBook(code = useLanguage.getState().language): { t: string; en: string; r?: string; box: number; due: number | null }[] {
    const memory = useLanguage.getState().memory[code] ?? {};
    const seen = new Set<string>();
    return languageService.studiedItems(code).filter((x) => !seen.has(x.t) && seen.add(x.t))
      .map((x) => ({ ...x, box: memory[x.t]?.box ?? 0, due: memory[x.t]?.due ?? null }));
  },

  /** XP earned today. */
  todayXp(): number {
    const { today } = useLanguage.getState();
    return today?.day === dayKey() ? today.xp : 0;
  },

  /** The next daily goal in the list (tap to change it). */
  cycleGoal(): void {
    const { goal } = useLanguage.getState();
    useLanguage.setState({ goal: DAILY_GOALS[(DAILY_GOALS.indexOf(goal) + 1) % DAILY_GOALS.length] });
  },

  /** True when the phone has a speech recognizer, so lessons include speaking. */
  /**
   * True when lessons include speaking. On by default: with the phone's speech recognizer
   * Atlas checks what you said; without one you say it aloud and check yourself.
   */
  async canSpeak(): Promise<boolean> {
    return useLanguage.getState().speaking;
  },

  /** Speaking exercises on or off (somewhere you cannot talk out loud). */
  setSpeaking(on: boolean): void { useLanguage.setState({ speaking: on }); },

  /** Words for a review square: the ones due first, topped up with words studied most recently. */
  reviewSquareWords(code = useLanguage.getState().language): Item[] {
    const studied = languageService.studiedItems(code);
    const due = dueItems(studied, useLanguage.getState().memory[code] ?? {}, { n: 10 });
    const more = studied.slice().reverse().filter((x) => !due.some((d) => d.t === x.t));
    const words = [...due, ...more].slice(0, 10);
    if (words.length < 4) throw new Error('Finish a few lessons first, then this square reviews their words.');
    return words;
  },

  /** Every word of a level written so far, for its checkpoint. */
  levelWords(level: LevelId, code = useLanguage.getState().language): Item[] {
    const { content } = useLanguage.getState();
    const words = unitsForLevel(level).flatMap((u) => (u.builtIn ? builtInWords(u, code) : content[code]?.[u.id] ?? []));
    if (words.length < 6) throw new Error('Do this level\'s lessons first: the checkpoint tests all of them.');
    return words;
  },

  /** How many words are due for review now. */
  dueCount(code = useLanguage.getState().language): number {
    return dueItems(languageService.studiedItems(code), useLanguage.getState().memory[code] ?? {}, { n: 1000 }).length;
  },

  /** Writes a story or two-person podcast at the learner's level, with questions and its new words. Kept, newest first. */
  makeListening(kind: Listening['kind'], topic: string, onStep: (m: string) => void = () => undefined): Promise<Listening> {
    return writeListening({ kind, topic }, onStep);
  },

  /**
   * A pre-made story or podcast (library.ts): kept from last time, written out on the phone
   * (Spanish), or written once by the AI from its outline. Real news is fetched and written
   * fresh each day.
   */
  async openPremade(id: string, onStep: (m: string) => void = () => undefined): Promise<Listening> {
    const premade = pieceById(id);
    if (!premade) throw new Error('That piece is not in the library.');
    const code = useLanguage.getState().language;
    const pieceId = id === REAL_NEWS ? `${REAL_NEWS}@${new Date().toDateString()}` : id;
    const kept = useLanguage.getState().listening[code]?.find((l) => l.pieceId === pieceId);
    if (kept) return kept;
    const written = writtenPiece(id, code);
    if (written) {
      const piece: Listening = { ...written, vocab: newWords(written.vocab, knownSet(languageService.knownItems(code))), createdAt: Date.now(), pieceId };
      keepListening(code, piece);
      return piece;
    }
    let outline = premade.outline;
    if (id === REAL_NEWS) {
      onStep('Getting today\'s headlines...');
      const { latestHeadlines } = require('../atlasTools/dailyBrief');
      const heads: { title: string }[] = await latestHeadlines('world', 4).catch(() => []);
      if (!heads.length) throw new Error('No headlines right now. Check the internet connection, or pick made-up or historical news.');
      outline = `A short news bulletin read by two presenters, Ana and Leo, about these real headlines from today, one per part: ${heads.map((h) => h.title).join(' | ')}`;
    }
    return writeListening({ kind: premade.kind, topic: '', outline, pieceId }, onStep);
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
    const { language: code, progress, xp, streak, memory, today: day, history = {} } = useLanguage.getState();
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
      today: { day: today, xp: (day?.day === today ? day.xp : 0) + gained },
      history: keepDays({ ...history, [today]: { xp: (history[today]?.xp ?? 0) + gained, lessons: (history[today]?.lessons ?? 0) + 1 } }),
      streak: nextStreak,
      memory: { ...memory, [code]: mem },
    });
    return { stars, xp: gained, streak: nextStreak.count };
  },
};
