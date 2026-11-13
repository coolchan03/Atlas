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
