/**
 * What one chapter is on the board: the learning part (the reading), its key terms, a worked example, a quiz, an assignment and
 * a chapter exam. Six squares, so a chapter is a stretch of the board the learner works through, not a single stop. Used for exam
 * checklists and textbooks, which are made without the AI's help in planning. Pure.
 */
import type { PlannedSquare } from './plannedSquare';

export const CHAPTER_SQUARES = 6;
type Square = Omit<PlannedSquare, 'key'>;

const fit = (name: string, suffix: string): string => `${name.slice(0, Math.max(8, 60 - suffix.length))}${suffix}`;

/** "Chapter 7: Leases" and "7 – Leases" are both about Leases. */
export const subjectOf = (name: string): string => name.replace(/^(?:(?:chapter|unit|module|lesson|part)\s+(?:\d+|[ivxlc]+)|\d{1,3})\s*[:.\-–—·]?\s*/i, '').trim() || name;

/** Extra practice a deeper chapter adds before its chapter exam, in this order (the word games last). A chapter is 6 to 18 squares. */
export const MAX_CHAPTER_SQUARES = 18;
function extraSquares(name: string, unit: string, about: string): Square[] {
  return [
    { format: 'truefalse', title: fit(name, ': true or false'), focus: `True or false statements on ${name} ${about}, including the common wrong beliefs`, unit },
    { format: 'fill', title: fit(name, ': fill the blanks'), focus: `Fill-in-the-blank sentences on the key rules and terms of ${name} ${about}`, unit },
    { format: 'scenario', title: fit(name, ': case study'), focus: `A short realistic case on ${name} ${about}, with questions on what to do and why`, unit },
    { format: 'recall', title: fit(name, ': type the answer'), focus: `Short prompts on ${name} ${about} answered by typing the term, rule or figure`, unit },
    { format: 'reading', title: fit(name, ': read and answer'), focus: `A short passage or case on ${name} ${about}, followed by questions on it`, unit },
    { format: 'match', title: fit(name, ': match'), focus: `Pairs to join for ${name} ${about}: terms to meanings, causes to effects`, unit },
    { format: 'sort', title: fit(name, ': sort'), focus: `Items of ${name} ${about} to sort into the right groups`, unit },
    { format: 'numeric', title: fit(name, ': calculations'), focus: `Calculation practice for ${name} ${about}, with the working shown`, unit },
    { format: 'crossword', title: fit(name, ': crossword'), focus: `A crossword of the key terms of ${name} ${about}, each with a clue`, unit },
    { format: 'wordsearch', title: fit(name, ': word search'), focus: `A word search hiding the key terms of ${name} ${about}`, unit },
    { format: 'scramble', title: fit(name, ': word scramble'), focus: `Key terms of ${name} ${about} with their letters mixed up, each with a hint`, unit },
    { format: 'memory', title: fit(name, ': memory match'), focus: `Flip cards to match each key term of ${name} ${about} with its definition`, unit },
  ];
}

/** A chapter: its name, the unit it belongs to, and what it is for ("for the FAR exam (Area)"). */
export interface Chapter { name: string; unit: string; about: string; /** The book's full heading when `name` is a short subject: passages and questions are matched on it. */ topic?: string }

/**
 * The squares of a chapter, in the order they are played. `size` is 6 up to 14: the squares beyond six are extra practice, placed
 * before the chapter exam.
 */
export function deepChapter(chapter: Chapter, size: number): Square[] {
  const { name, unit, about } = chapter;
  const six = baseSquares(name, unit, about);
  const extra = extraSquares(name, unit, about).slice(0, Math.max(0, Math.min(MAX_CHAPTER_SQUARES, size) - CHAPTER_SQUARES));
  // Every square knows the subject it is about, so a chapter exam is matched on "Leases" and not on the words every exam shares.
  const subject = chapter.topic?.trim() || subjectOf(name);
  const topic = /^(?:chapter|unit|module|lesson|part)?\s*(?:\d+|[ivxlc]+)?$/i.test(subject) ? undefined : subject; // an untitled "Chapter 7" has no subject to match on
  return [...six.slice(0, -1), ...extra, six[six.length - 1]].map((sq) => (topic ? { ...sq, topic } : sq));
}

/** The six squares of a chapter called `name`, in the order they are played. `about` says what it is for ("for the FAR exam (Area)"). */
export const chapterSquares = (name: string, unit: string, about: string): Square[] => deepChapter({ name, unit, about }, CHAPTER_SQUARES);

function baseSquares(name: string, unit: string, about: string): Square[] {
  return [
    { format: 'lesson', title: name.slice(0, 60), focus: `Read ${name} ${about}: the ideas in the order they are taught, with the rules, examples and the mistakes people make`, unit },
    { format: 'cards', title: fit(name, ': key terms'), focus: `The key terms, rules and definitions of ${name} ${about}`, unit },
    { format: 'worked', title: fit(name, ': worked example'), focus: `One realistic worked example from ${name} ${about}, solved step by step with the reason for each step`, unit },
    { format: 'quiz', title: fit(name, ': quiz'), focus: `A quiz on ${name} ${about}: each question checks one idea from the reading`, unit },
    { format: 'practice', title: fit(name, ': assignment'), focus: `An assignment on ${name} ${about}: a task the learner does in their own words, compared with a model answer`, unit },
    { format: 'quiz', title: fit(name, ': chapter exam'), focus: `The chapter exam for ${name} ${about}: harder mixed questions across everything in the chapter, like a real exam`, unit, checkpoint: true },
  ];
}

/**
 * A course the AI planned has one lesson square per topic. Each lesson becomes a full chapter of six squares, and the plain quiz or key-terms square the
 * AI put straight after it is dropped (the chapter has its own). Squares of any other kind (matching, ordering, practice, unit tests) stay where they are.
 */
export function expandLessons(squares: PlannedSquare[], max: number): PlannedSquare[] {
  // Each lesson becomes one GROUP (its whole chapter); every other square is a group of one. When the course is longer than `max`, whole groups
  // are kept in their order and the rest are left off: a chapter is never cut in the middle (that lost its chapter exam and left the course
  // outline with half a chapter), and a later short square is never kept after an earlier chapter was dropped (no gaps, no reordering).
  const groups: Square[][] = [];
  squares.forEach((sq, i) => {
    if (sq.format === 'lesson' && !sq.checkpoint) { groups.push(chapterSquares(sq.title, sq.unit, `(${sq.focus})`)); return; }
    const before = squares[i - 1];
    const redundant = (sq.format === 'quiz' || sq.format === 'cards') && !sq.checkpoint && before?.format === 'lesson' && before.unit === sq.unit;
    if (!redundant) groups.push([sq]);
  });
  const out: Square[] = [];
  for (const g of groups) {
    if (out.length + g.length > max) break;
    out.push(...g);
  }
  return out.map((sq, i) => ({ ...sq, key: `s${i + 1}` }));
}
