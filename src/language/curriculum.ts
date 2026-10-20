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
  // Level 1 - Basic (A1-A2): survival words and the first grammar, in small steps.
  v(1, ['basics', 'Basics', 'smile'], ['hello', 'goodbye', 'please', 'thank you', 'yes', 'no', 'sorry', 'excuse me']),
  v(1, ['intro', 'Meeting people', 'users'], ['What is your name?', 'My name is Sam.', 'Nice to meet you.', 'How are you?', 'I am fine.', 'Where are you from?', 'I speak a little.', 'I do not understand.']),
  g(1, ['g-be', 'To be and to have'], 'saying who and what things are, and what you have: I am, you are, it is, I have, we have'),
  v(1, ['numbers', 'Numbers 1-10', 'hash'], ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']),
  g(1, ['g-articles', 'The, a and plurals'], 'articles (the, a), noun gender if the language has it, and making nouns plural'),
  v(1, ['colors', 'Colours', 'droplet'], ['red', 'blue', 'green', 'yellow', 'black', 'white', 'The car is red.', 'My favourite colour is blue.']),
  v(1, ['food', 'Food and drink', 'coffee'], ['water', 'bread', 'coffee', 'tea', 'I am hungry.', 'The bill, please.', 'I would like a coffee.', 'It is delicious.']),
  g(1, ['g-present', 'Everyday verbs now'], 'present tense of everyday verbs (eat, drink, live, work, go, want) for I, you, he, she, we, they'),
  v(1, ['fruit', 'Fruit and vegetables', 'shopping-cart'], ['apple', 'banana', 'orange', 'tomato', 'potato', 'onion', 'I like apples.', 'Two kilos of potatoes, please.']),
  v(1, ['numbers2', 'Numbers 11-100', 'hash'], ['eleven', 'twelve', 'fifteen', 'twenty', 'thirty', 'fifty', 'one hundred', 'I am twenty-five years old.']),
  g(1, ['g-adjectives', 'Big, small, good'], 'adjectives after and before nouns, and making them agree (big house, small houses)'),
  v(1, ['directions', 'Directions', 'compass'], ['left', 'right', 'straight ahead', 'near', 'far', 'Where is the station?', 'Where is the bathroom?', 'Turn left here.']),
  g(1, ['g-questions', 'Questions and no'], 'asking questions (what, where, who, when, how much) and saying no or not'),
  v(1, ['city', 'In town', 'map-pin'], ['the bank', 'the shop', 'the park', 'the hospital', 'the school', 'the street', 'The bank is next to the park.', 'Is there a pharmacy near here?']),
  g(1, ['g-there-is', 'There is, there are'], 'saying what there is in a place: there is a ..., there are two ..., is there ...?'),
  v(1, ['shopping', 'Shopping', 'shopping-bag'], ['How much is it?', 'too expensive', 'I will take it.', 'cash', 'card', 'open', 'closed', 'the market']),
  v(1, ['clothes', 'Clothes', 'shopping-bag'], ['shirt', 'trousers', 'shoes', 'dress', 'jacket', 'hat', 'I need a bigger size.', 'Can I try it on?']),
  g(1, ['g-possessive', 'My, your, his'], 'possessives: my, your, his, her, our, their, with family and things'),
  v(1, ['time', 'Time and days', 'clock'], ['today', 'tomorrow', 'yesterday', 'morning', 'night', 'What time is it?', 'Monday', 'the weekend']),
  v(1, ['days', 'Days and months', 'calendar'], ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'January', 'June', 'My birthday is in May.', 'See you on Friday.']),
  v(1, ['family', 'Family', 'heart'], ['mother', 'father', 'friend', 'child', 'brother', 'sister', 'my family', 'I have two children.']),
  g(1, ['g-like', 'I like, I want'], 'likes and wants: I like, I do not like, I want, I need, I can, followed by a verb or a thing'),
  v(1, ['animals', 'Animals', 'feather'], ['dog', 'cat', 'bird', 'horse', 'fish', 'cow', 'I have a dog.', 'The cat is sleeping.']),
  v(1, ['body', 'The body', 'user'], ['head', 'hand', 'foot', 'eye', 'mouth', 'back', 'My head hurts.', 'Wash your hands.']),
  v(1, ['weather', 'Weather', 'cloud'], ['sun', 'rain', 'snow', 'wind', 'hot', 'cold', 'It is raining.', 'It is very hot today.']),
  g(1, ['g-place', 'In, on, under'], 'prepositions of place: in, on, under, next to, between, in front of, behind'),
  v(1, ['transport', 'Getting around', 'navigation'], ['car', 'bike', 'taxi', 'metro', 'on foot', 'one ticket', 'Where does this bus go?', 'I am going by train.']),
  v(1, ['travel', 'Travel', 'map'], ['hotel', 'ticket', 'airport', 'bus', 'train', 'passport', 'Where is the bus stop?', 'I have a reservation.']),
  v(1, ['hobbies', 'Free time', 'music'], ['music', 'films', 'football', 'reading', 'to swim', 'to cook', 'I like to read.', 'What do you do at the weekend?']),
  v(1, ['feelings', 'Feelings', 'smile'], ['happy', 'sad', 'tired', 'angry', 'bored', 'scared', 'I am very happy.', 'Are you tired?']),
  { id: 'help', title: 'Health and help', icon: 'life-buoy', level: 1, kind: 'vocab', items: PHRASES_EN.slice(0, 12), builtIn: true },
  // Level 2 - Intermediate (B1): telling stories, plans, daily life and travel problems.
  g(2, ['g-past', 'What happened'], 'the past tense: saying what you did yesterday, last week and last year'),
  t(2, ['routine', 'Daily routine', 'sun'], 'describing a normal day: waking up, work or school, meals, evenings, with time words'),
  g(2, ['g-used-to', 'When I was young'], 'talking about past habits and descriptions (I used to, it was, we would), and how they differ from single past events'),
  g(2, ['g-future', 'Plans'], 'talking about the future and plans: going to, will, next week, tomorrow'),
  t(2, ['home', 'Home and furniture', 'home'], 'rooms and furniture (table, chair, bed, sofa, kitchen) and saying where things are'),
  g(2, ['g-now', 'Right now'], 'actions happening now (I am cooking, she is working) compared with habits'),
  t(2, ['kitchen', 'Cooking', 'coffee'], 'kitchen things, ingredients and following a simple recipe (cut, boil, mix, add)'),
  g(2, ['g-compare', 'Bigger and better'], 'comparing things: more, less, bigger, better, the best, as ... as'),
  t(2, ['health', 'At the doctor', 'activity'], 'describing how you feel, body parts, symptoms and following advice'),
  g(2, ['g-pronouns', 'It, him, her, them'], 'object pronouns and reflexive verbs (I get up, I wash myself) in everyday sentences'),
  t(2, ['restaurant', 'Eating out', 'coffee'], 'ordering, asking about dishes, allergies, paying and giving a short opinion of a meal'),
  g(2, ['g-commands', 'Do this, do not do that'], 'commands and polite requests: come here, do not touch, could you, please'),
  t(2, ['hotel', 'At the hotel', 'key'], 'booking a room, checking in and out, asking for things and reporting problems'),
  t(2, ['travel-problems', 'Travel problems', 'alert-circle'], 'missed trains, lost bags, delays, asking for help and changing tickets'),
  g(2, ['g-modals', 'Must, should, can'], 'obligation and advice: must, have to, should, can, may, not allowed'),
  t(2, ['work', 'Work and study', 'briefcase'], 'jobs, the workplace, school subjects and talking about what you do'),
  t(2, ['phone', 'On the phone', 'phone'], 'phone calls and messages: leaving a message, making an appointment, spelling your name'),
  g(2, ['g-time', 'Since, for, ago'], 'time expressions: since, for, ago, already, yet, still, just'),
  t(2, ['sports', 'Sport and fitness', 'activity'], 'sports, the gym, matches and talking about how often you exercise'),
  t(2, ['nature', 'In the countryside', 'feather'], 'mountains, rivers, trees, the beach, camping and the seasons'),
  t(2, ['services', 'Bank and post office', 'credit-card'], 'opening an account, sending a parcel, changing money, filling in a form'),
  g(2, ['g-connectors', 'Because, but, so'], 'joining ideas: because, but, so, when, if, although, then'),
  t(2, ['personality', 'What people are like', 'users'], 'describing people: looks, personality, habits, likes and dislikes'),
  t(2, ['emergency', 'Emergencies', 'alert-triangle'], 'accidents, calling for help, the police, describing what happened and where you are'),
  // Level 3 - Advanced (B2): opinions, hypotheticals, news and the wider world.
  g(3, ['g-conditional', 'Would and if'], 'the conditional (would) and if-sentences about possible and imagined situations'),
  t(3, ['opinions', 'Giving opinions', 'message-square'], 'agreeing, disagreeing politely, giving reasons and examples'),
  g(3, ['g-subjunctive', 'Wishes and doubts'], 'wishes, doubts, advice and emotions (the subjunctive where the language has one)'),
  t(3, ['news', 'In the news', 'globe'], 'common news topics: weather, economy, elections, science, sport results, with news-style phrasing'),
  g(3, ['g-perfect', 'Had done, will have done'], 'past perfect and future perfect: what had happened before, what will have happened by then'),
  t(3, ['job-interview', 'Job interview', 'briefcase'], 'describing experience and skills, answering interview questions, asking about the job'),
  g(3, ['g-passive', 'It was made'], 'the passive voice and relative clauses (which, who, where) in descriptions'),
  t(3, ['environment', 'Nature and the environment', 'feather'], 'climate, recycling, nature and discussing problems and solutions'),
  g(3, ['g-reported', 'She said that'], 'reported speech: telling what someone said, asked or told you to do'),
  t(3, ['technology', 'Technology', 'smartphone'], 'phones, the internet, apps and talking about how technology changes life'),
  t(3, ['money', 'Money and banking', 'dollar-sign'], 'budgets, saving, loans, prices, rent and complaining about a bill'),
  g(3, ['g-if-past', 'If I had known'], 'if-sentences about the past and regrets: if I had known, I would have'),
  t(3, ['relationships', 'Relationships', 'heart'], 'friendship, dating, family conflicts, apologising and making up'),
  t(3, ['media', 'Media and social media', 'tv'], 'films, series, influencers, fake news, reviews and recommending something'),
  g(3, ['g-linking', 'However and therefore'], 'linking ideas in longer speech: however, therefore, despite, whereas, as a result, in addition'),
  t(3, ['education', 'Education', 'book'], 'school systems, university, exams, learning styles and lifelong learning'),
  t(3, ['society', 'Society and politics', 'flag'], 'elections, laws, rights, public services and discussing them calmly'),
  t(3, ['science', 'Science and health', 'activity'], 'research, medicine, the body, healthy habits and explaining a discovery simply'),
  // Level 4 - Fluent (C1-C2): nuance, register, culture and precise argument.
  t(4, ['idioms', 'Idioms', 'zap'], 'common idioms and fixed expressions, with what they really mean'),
  g(4, ['g-register', 'Formal and casual'], 'the same message said formally (letters, officials) and casually (friends), and when to use each'),
  t(4, ['culture', 'Culture and customs', 'flag'], 'customs, holidays, food traditions and manners where the language is spoken'),
  t(4, ['slang', 'Slang and everyday speech', 'message-circle'], 'common informal words, fillers and abbreviations people really use, and when not to use them'),
  t(4, ['debate', 'Debate', 'mic'], 'arguing a point precisely: hedging, conceding, contrasting and concluding'),
  g(4, ['g-nuance', 'Saying it precisely'], 'nuance: near-synonyms, tone, emphasis and connectors that change meaning'),
  t(4, ['business', 'Business and negotiation', 'briefcase'], 'meetings, proposals, negotiating, persuading and writing a professional email'),
  t(4, ['law', 'Law and rights', 'shield'], 'contracts, tenants and consumers, the courts and explaining your rights'),
  g(4, ['g-advanced-subj', 'If only, as if'], 'advanced subjunctive and unreal forms: if only, as if, it is time that, whoever, wherever'),
  t(4, ['humour', 'Humour and wordplay', 'smile'], 'jokes, puns, irony and sarcasm, and how humour differs between cultures'),
  t(4, ['history', 'History', 'clock'], 'important events in the history of places where the language is spoken, told in narrative past tenses'),
  t(4, ['arts', 'Art, music and film', 'music'], 'describing and reviewing art, music and film with rich, precise vocabulary'),
  g(4, ['g-style', 'Style and emphasis'], 'stylistic word order, emphasis and inversion (never have I ...), and discourse markers'),
  t(4, ['philosophy', 'Big questions', 'help-circle'], 'ethics, happiness, freedom and the meaning of life, discussed with abstract vocabulary'),
  t(4, ['regional', 'Regional differences', 'map'], 'how the language changes between countries and regions: words, accents and expressions'),
  t(4, ['literature', 'Stories and literature', 'book'], 'describing stories, characters and feelings with rich, literary vocabulary'),
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id);
export const unitsForLevel = (level: LevelId) => UNITS.filter((u) => u.level === level);
export const KIND_LABEL: Record<UnitKind, string> = { vocab: 'Vocabulary', grammar: 'Grammar', theme: 'Theme' };
