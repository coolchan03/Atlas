/**
 * What one chapter is on the board: the learning part (the reading), its key terms, a worked example, a quiz, an assignment and
 * a chapter exam. Six squares, so a chapter is a stretch of the board the learner works through, not a single stop. Used for exam
 * checklists and textbooks, which are made without the AI's help in planning. Pure.
 */
import type { PlannedSquare } from './formats';

export const CHAPTER_SQUARES = 6;
type Square = Omit<PlannedSquare, 'key'>;

const fit = (name: string, suffix: string): string => `${name.slice(0, Math.max(8, 60 - suffix.length))}${suffix}`;

/** The six squares of a chapter called `name`, in the order they are played. `about` says what it is for ("for the FAR exam (Area)"). */
export function chapterSquares(name: string, unit: string, about: string): Square[] {
  return [
    { format: 'lesson', title: name.slice(0, 60), focus: `Read ${name} ${about}: the ideas in the order they are taught, with the rules, examples and the mistakes people make`, unit },
    { format: 'cards', title: fit(name, ': key terms'), focus: `The key terms, rules and definitions of ${name} ${about}`, unit },
    { format: 'worked', title: fit(name, ': worked example'), focus: `One realistic worked example from ${name} ${about}, solved step by step with the reason for each step`, unit },
    { format: 'quiz', title: fit(name, ': quiz'), focus: `A quiz on ${name} ${about}: each question checks one idea from the reading`, unit },
    { format: 'practice', title: fit(name, ': assignment'), focus: `An assignment on ${name} ${about}: a task the learner does in their own words, compared with a model answer`, unit },
    { format: 'quiz', title: fit(name, ': chapter exam'), focus: `The chapter exam for ${name} ${about}: harder mixed questions across everything in the chapter, like a real exam`, unit, checkpoint: true },
  ];
}
