/**
 * Puts reviewed, normalized questions where the person chose: the exam (measured, never studied), the study questions
 * (the learner researches them), or a split with some held back for the exam. Repeats of anything already there are skipped.
 */
import { divide, toExpected, withoutRepeats, type ImportTarget, type NormalizedQuestion } from './questionImport';
import { exams } from './engine';
import { newItem, useLearningStore } from './store';

export interface ImportOutcome { exam: number; study: number; repeats: number }

export function addImportedQuestions(subjectId: string, items: NormalizedQuestion[], target: ImportTarget): ImportOutcome {
  const store = useLearningStore.getState();
  const state = store.get(subjectId);
  const existing = [...exams.items(subjectId).map((i) => i.question), ...state.bank.filter((b) => b.status !== 'dropped').map((b) => b.q)];
  const { kept, repeats } = withoutRepeats(items, existing);
  const { exam, study } = divide(kept, target);
  const topic = store.getConfig(subjectId).topic;
  exam.forEach((q) => exams.addItem({ subjectId, topic: q.topic ?? topic, question: q.question, expected: toExpected(q) }));
  if (study.length) store.addItems(subjectId, study.map((q) => newItem(q.question, state.round || 1, 'approved')));
  return { exam: exam.length, study: study.length, repeats };
}
