/**
 * What one chapter is on the board: the learning part (the reading), its key terms, a worked example, a quiz, an assignment and
 * a chapter exam. Six squares, so a chapter is a stretch of the board the learner works through, not a single stop. Used for exam
 * checklists and textbooks, which are made without the AI's help in planning. Pure.
 */
import type { PlannedSquare } from './formats';

export const CHAPTER_SQUARES = 6;
type Square = Omit<PlannedSquare, 'key'>;

const fit = (name: string, suffix: string): string => `${name.slice(0, Math.max(8, 60 - suffix.length))}${suffix}`;

/** Extra practice a deeper chapter adds before its chapter exam, in this order. A chapter is 6 to 14 squares. */
export const MAX_CHAPTER_SQUARES = 14;
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
  ];
}

/** A chapter: its name, the unit it belongs to, and what it is for ("for the FAR exam (Area)"). */
export interface Chapter { name: string; unit: string; about: string }

/**
 * The squares of a chapter, in the order they are played. `size` is 6 up to 14: the squares beyond six are extra practice, placed
 * before the chapter exam.
 */
export function deepChapter(chapter: Chapter, size: number): Square[] {
  const { name, unit, about } = chapter;
  const six = baseSquares(name, unit, about);
  const extra = extraSquares(name, unit, about).slice(0, Math.max(0, Math.min(MAX_CHAPTER_SQUARES, size) - CHAPTER_SQUARES));
  return [...six.slice(0, -1), ...extra, six[six.length - 1]];
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
  const out: Square[] = [];
  squares.forEach((sq, i) => {
    if (sq.format === 'lesson' && !sq.checkpoint) { chapterSquares(sq.title, sq.unit, `(${sq.focus})`).forEach((c) => out.push(c)); return; }
    const before = squares[i - 1];
    const redundant = (sq.format === 'quiz' || sq.format === 'cards') && !sq.checkpoint && before?.format === 'lesson' && before.unit === sq.unit;
    if (!redundant) out.push(sq);
  });
  return out.slice(0, max).map((sq, i) => ({ ...sq, key: `s${i + 1}` }));
}
