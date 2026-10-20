/**
 * How Atlas teaches a language. This is the method the on-device model is given for every
 * lesson, story, podcast and practice chat, so the course behaves like a planned course and
 * not like random translation.
 *
 * Built on widely used, well-tested ideas:
 * - CEFR levels (Council of Europe): A1-A2 basic, B1 intermediate, B2 upper, C1-C2 fluent,
 *   each described by what the learner CAN DO.
 * - Comprehensible input (Krashen's "i+1"): reading and listening should be about 95% known
 *   words, with a few new ones learned from context.
 * - Active recall and the testing effect: producing an answer (typing, ordering words) teaches
 *   more than recognising it, so lessons move from recognition to production.
 * - Spaced repetition (Leitner boxes): words you miss come back sooner, words you know come back
 *   later (see review.ts).
 * - Short daily sessions: about 5-10 minutes, so a streak is easy to keep.
 */

export type LevelId = 1 | 2 | 3 | 4;

export interface LevelGuide {
  id: LevelId;
  name: string;
  cefr: string;
  /** What a learner at this level can do (CEFR-style "can do" statement). */
  canDo: string;
  /** Longest sentence for this level, in words. */
  maxWords: number;
  /** Grammar the level may use; anything beyond it is avoided in its texts. */
  grammar: string;
  /** Exercises in one lesson (about 30-40 seconds each). */
  lessonLength: number;
  /** Items taught in one unit. */
  items: number;
  /** Share of a lesson that asks the learner to produce (type or build) rather than pick. */
  production: number;
}

export const LEVELS: LevelGuide[] = [
  { id: 1, name: 'Basic', cefr: 'A1-A2', canDo: 'introduce yourself, ask and answer simple questions about everyday things, numbers, places and needs', maxWords: 6, grammar: 'present tense of common verbs, to be / to have, articles and gender, plurals, simple questions and negatives', lessonLength: 10, items: 8, production: 0.2 },
  { id: 2, name: 'Intermediate', cefr: 'B1', canDo: 'handle travel and daily situations, describe experiences and plans, give simple reasons and opinions', maxWords: 10, grammar: 'past and future tenses, reflexive verbs, comparisons, object pronouns, common connectors (because, but, so)', lessonLength: 12, items: 10, production: 0.35 },
  { id: 3, name: 'Advanced', cefr: 'B2', canDo: 'follow the main ideas of news and talks, explain a viewpoint, talk fluently with native speakers on familiar topics', maxWords: 16, grammar: 'all main tenses, conditional (would), if-sentences, subjunctive or its equivalent, passive voice, relative clauses', lessonLength: 14, items: 10, production: 0.5 },
  { id: 4, name: 'Fluent', cefr: 'C1-C2', canDo: 'understand long, complex texts and implied meaning, speak spontaneously and precisely, adapt between formal and casual speech', maxWords: 24, grammar: 'everything, including idioms, nuance, register (formal and informal), and literary or regional forms', lessonLength: 14, items: 10, production: 0.6 },
];

export const levelGuide = (id: LevelId | number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

/** The teaching method in a few lines, given to the model with every course request. */
export function methodFor(level: LevelGuide, language: string): string {
  return [
    `You teach ${language} to an English speaker at level ${level.id} (${level.name}, CEFR ${level.cefr}).`,
    `At this level the learner can ${level.canDo}.`,
    `Use only this grammar: ${level.grammar}. Keep sentences to at most ${level.maxWords} words.`,
    'Use natural, common, current everyday wording that a native speaker would really say. Prefer the standard, neutral form of the language.',
    'Teach new words and patterns in context, and reuse words the learner already knows (about 95% known words, a few new ones).',
  ].join(' ');
}

/** Parts in a story or podcast: longer pieces as the learner can follow more. */
export const storyParts = (level: LevelGuide) => (level.id <= 1 ? 4 : level.id === 2 ? 5 : 6);
