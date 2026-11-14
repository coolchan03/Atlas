/** Beginner, moderate and hard: one scale for course squares, practice questions, mock exams and flashcards. Pure. */
export type Difficulty = 'beginner' | 'moderate' | 'hard';
export const DIFFICULTIES: Array<{ id: Difficulty; label: string }> = [{ id: 'beginner', label: 'Beginner' }, { id: 'moderate', label: 'Moderate' }, { id: 'hard', label: 'Hard' }];

const TEXT: Record<Difficulty, string> = {
  beginner: 'BEGINNER difficulty: plain words, one idea at a time, simple and direct examples, questions that check the basic idea and the key terms, no tricks.',
  moderate: 'MODERATE difficulty: apply the ideas to typical situations, mix two ideas in a question, realistic examples with a little working, questions like a normal exam.',
  hard: 'HARD difficulty: exam-level or harder: multi-step problems, edge cases and exceptions, close wrong answers that test real understanding, scenarios that need judgement.',
};
export const difficultyNote = (d: Difficulty | undefined): string => (d ? `${TEXT[d]}\n` : '');

/** The starting difficulty for the level a person said they are at. */
export function difficultyFromLevel(level: string): Difficulty {
  if (/advanced/i.test(level)) return 'hard';
  if (/intermediate/i.test(level)) return 'moderate';
  return 'beginner';
}

const READING: Record<Difficulty, string> = {
  beginner: 'This square is the READING, written as the full chapter for a beginner: every idea explained from the start with examples, in the order a textbook teaches it, nothing assumed and nothing skipped.',
  moderate: 'This square is the READING, written as a clear condensed chapter: the ideas and rules in order with the main examples, without repeating the basics.',
  hard: 'This square is the READING, written as an expert summary: the general rules, the exceptions and the points most often tested, tight and without hand-holding.',
};
/** How much a lesson square should read like a chapter: the whole chapter for beginners, a summary and the rules for experts. */
export const readingNote = (d: Difficulty | undefined): string => (d ? `${READING[d]}\n` : '');
