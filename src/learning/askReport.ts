/**
 * Asking the learning AI a question and getting the answer as a report that the judge and the manager review. The question goes to the front of
 * the study list marked as asked, so the cycle researches it next, writes the report, and the judge and manager look at it at once (rather than
 * waiting for the usual batch). If learning is not running it is started.
 */
import { isLearning, startLearning } from './engine';
import { newItem, useLearningStore } from './store';

export function askAsReport(agentId: string, question: string): { queued: boolean; started: boolean; why?: string } {
  const q = question.trim();
  if (q.length < 8) return { queued: false, started: false, why: 'Write the question in a full sentence.' };
  const cfg = useLearningStore.getState().getConfig(agentId);
  if (!cfg.topic.trim()) return { queued: false, started: false, why: 'Set what it is learning first.' };
  const store = useLearningStore.getState();
  const round = store.get(agentId).round || 1;
  store.addItems(agentId, [{ ...newItem(q, round, 'approved'), kind: 'asked' }]);
  if (isLearning()) return { queued: true, started: false };
  startLearning(agentId).catch(() => undefined);
  return { queued: true, started: true };
}
