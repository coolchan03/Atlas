import type { ExamMetrics } from './exams';

/** A short stable fingerprint of text (FNV-1a), so two runs can tell whether they asked the same questions with the same answer keys. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Null when two runs can be compared; otherwise why not. Runs saved before this was recorded can only be compared with each other. */
export function whyNotComparable(a: ExamMetrics, b: ExamMetrics): string | null {
  if (!a.context && !b.context) return null;
  if (!a.context || !b.context) return 'One of the two runs was saved before Atlas recorded which questions, subject and model it used, so they cannot be shown to be the same exam. Run the exam again in both modes.';
  if (a.context.subjectId !== b.context.subjectId) return 'The two runs were for different subjects, so they cannot be compared. Run the exam again in both modes.';
  if (a.context.questionSet !== b.context.questionSet) return 'The two runs asked different questions or used different answer keys (a question was added, removed or edited in between), so they cannot be compared. Run the exam again in both modes.';
  if (a.context.model !== b.context.model) return `The two runs used different models (${a.context.model || 'unknown'} and ${b.context.model || 'unknown'}), so a difference could be the model, not the memory. Run the exam again in both modes with one model.`;
  if (a.context.grading !== b.context.grading) return 'The two runs were graded under different rules, so they cannot be compared. Run the exam again in both modes.';
  return null;
}

