/**
 * The course plan: four levels (see teaching.ts), each with vocabulary, grammar and theme
 * units in a sensible order. Vocabulary units list the exact English words they teach.
 * Grammar and theme units give a goal, and the on-device model writes example sentences for
 * it, at the level's difficulty, once per language (see languageService).
 * Health and help uses the phone's phrase cards, so it works with no model at all.
 */
import { PHRASES_EN } from '../phrases/data';
import type { LevelId } from './teaching';

export type UnitKind = 'vocab' | 'grammar' | 'theme';

export interface Unit {
  id: string; title: string; icon: string; level: LevelId; kind: UnitKind;
  /** Exact English items (vocabulary); otherwise the model writes items for `goal`. */
  items: string[];
  /** What the unit teaches, for grammar and theme units. */
  goal?: string;
  builtIn?: boolean;
}

const v = (level: LevelId, [id, title, icon]: [string, string, string], items: string[]): Unit => ({ id, title, icon, level, kind: 'vocab', items });
const g = (level: LevelId, [id, title]: [string, string], goal: string): Unit => ({ id, title, icon: 'tool', level, kind: 'grammar', items: [], goal });
const t = (level: LevelId, [id, title, icon]: [string, string, string], goal: string): Unit => ({ id, title, icon, level, kind: 'theme', items: [], goal });

export const UNITS: Unit[] = [
  // Level 1 - Basic (A1-A2)
  v(1, ['basics', 'Basics', 'smile'], ['hello', 'goodbye', 'please', 'thank you', 'yes', 'no', 'sorry', 'excuse me']),
  v(1, ['intro', 'Meeting people', 'users'], ['What is your name?', 'My name is Sam.', 'Nice to meet you.', 'How are you?', 'I am fine.', 'Where are you from?', 'I speak a little.', 'I do not understand.']),
  g(1, ['g-be', 'To be and to have'], 'saying who and what things are, and what you have: I am, you are, it is, I have, we have'),
  v(1, ['numbers', 'Numbers', 'hash'], ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']),
  g(1, ['g-articles', 'The, a and plurals'], 'articles (the, a), noun gender if the language has it, and making nouns plural'),
  v(1, ['food', 'Food and drink', 'coffee'], ['water', 'bread', 'coffee', 'tea', 'I am hungry.', 'The bill, please.', 'I would like a coffee.', 'It is delicious.']),
  g(1, ['g-present', 'Everyday verbs now'], 'present tense of everyday verbs (eat, drink, live, work, go, want) for I, you, he, she, we, they'),
  v(1, ['directions', 'Directions', 'compass'], ['left', 'right', 'straight ahead', 'near', 'far', 'Where is the station?', 'Where is the bathroom?', 'Turn left here.']),
  g(1, ['g-questions', 'Questions and no'], 'asking questions (what, where, who, when, how much) and saying no or not'),
  v(1, ['shopping', 'Shopping', 'shopping-bag'], ['How much is it?', 'too expensive', 'I will take it.', 'cash', 'card', 'open', 'closed', 'the market']),
  v(1, ['time', 'Time and days', 'clock'], ['today', 'tomorrow', 'yesterday', 'morning', 'night', 'What time is it?', 'Monday', 'the weekend']),
  v(1, ['family', 'Family', 'heart'], ['mother', 'father', 'friend', 'child', 'brother', 'sister', 'my family', 'I have two children.']),
  v(1, ['travel', 'Travel', 'map'], ['hotel', 'ticket', 'airport', 'bus', 'train', 'passport', 'Where is the bus stop?', 'I have a reservation.']),
  { id: 'help', title: 'Health and help', icon: 'life-buoy', level: 1, kind: 'vocab', items: PHRASES_EN.slice(0, 12), builtIn: true },
  // Level 2 - Intermediate (B1)
  g(2, ['g-past', 'What happened'], 'the past tense: saying what you did yesterday, last week and last year'),
  t(2, ['routine', 'Daily routine', 'sun'], 'describing a normal day: waking up, work or school, meals, evenings, with time words'),
  g(2, ['g-future', 'Plans'], 'talking about the future and plans: going to, will, next week, tomorrow'),
  t(2, ['home', 'Home and furniture', 'home'], 'rooms and furniture (table, chair, bed, sofa, kitchen) and saying where things are'),
  g(2, ['g-compare', 'Bigger and better'], 'comparing things: more, less, bigger, better, the best, as ... as'),
  t(2, ['health', 'At the doctor', 'activity'], 'describing how you feel, body parts, symptoms and following advice'),
  g(2, ['g-pronouns', 'It, him, her, them'], 'object pronouns and reflexive verbs (I get up, I wash myself) in everyday sentences'),
  t(2, ['restaurant', 'Eating out', 'coffee'], 'ordering, asking about dishes, allergies, paying and giving a short opinion of a meal'),
  t(2, ['work', 'Work and study', 'briefcase'], 'jobs, the workplace, school subjects and talking about what you do'),
  // Level 3 - Advanced (B2)
  g(3, ['g-conditional', 'Would and if'], 'the conditional (would) and if-sentences about possible and imagined situations'),
  t(3, ['opinions', 'Giving opinions', 'message-square'], 'agreeing, disagreeing politely, giving reasons and examples'),
  g(3, ['g-subjunctive', 'Wishes and doubts'], 'wishes, doubts, advice and emotions (the subjunctive where the language has one)'),
  t(3, ['news', 'In the news', 'globe'], 'common news topics: weather, economy, elections, science, sport results, with news-style phrasing'),
  g(3, ['g-passive', 'It was made'], 'the passive voice and relative clauses (which, who, where) in descriptions'),
  t(3, ['environment', 'Nature and the environment', 'feather'], 'climate, recycling, nature and discussing problems and solutions'),
  t(3, ['technology', 'Technology', 'smartphone'], 'phones, the internet, apps and talking about how technology changes life'),
  // Level 4 - Fluent (C1-C2)
  t(4, ['idioms', 'Idioms', 'zap'], 'common idioms and fixed expressions, with what they really mean'),
  g(4, ['g-register', 'Formal and casual'], 'the same message said formally (letters, officials) and casually (friends), and when to use each'),
  t(4, ['culture', 'Culture and customs', 'flag'], 'customs, holidays, food traditions and manners where the language is spoken'),
  t(4, ['debate', 'Debate', 'mic'], 'arguing a point precisely: hedging, conceding, contrasting and concluding'),
  g(4, ['g-nuance', 'Saying it precisely'], 'nuance: near-synonyms, tone, emphasis and connectors that change meaning'),
  t(4, ['literature', 'Stories and literature', 'book'], 'describing stories, characters and feelings with rich, literary vocabulary'),
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id);
export const unitsForLevel = (level: LevelId) => UNITS.filter((u) => u.level === level);
export const KIND_LABEL: Record<UnitKind, string> = { vocab: 'Vocabulary', grammar: 'Grammar', theme: 'Theme' };
