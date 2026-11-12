import type { LearningKnowledgeDb } from './knowledgeDb';
import { citedNumbers } from './evidenceGate';
import { numbersIn, similarity } from './claimText';

/** The three ways the same questions are answered, so retrieval and memory can be measured against the model alone. */
export type ExamMode = 'baseline' | 'sources' | 'memory';
export const EXAM_MODES: ExamMode[] = ['baseline', 'sources', 'memory'];
export const EXAM_MODE_LABEL: Record<ExamMode, string> = { baseline: 'The model alone', sources: 'With sources', memory: 'With sources and stored memory' };

/** Bump when scoring changes, so results from different rules are never compared. */
export const BENCHMARK_VERSION = '1';

export interface Expected {
  /** Each entry is a fact; any one of its wordings counts ("one minute", "1 minute", "60 seconds"). */
  facts: string[][];
  /** Wordings that must not appear: out-of-date figures, or the common wrong answer. */
  forbid?: string[];
}
export interface ExamItem { id: string; subjectId: string; topic: string; question: string; expected: Expected }

export interface ItemResult { id: string; correct: boolean; score: number; outdated: boolean; seconds: number }
export interface ExamMetrics {
  total: number;
  correct: number;
  accuracy: number;
  /** Answers that used a figure the exam marks as out of date or wrong. */
  outdatedAnswers: number;
  /** Citations [n] pointing at a source the model was never given. */
  unsupportedCitations: number;
  /** Questions answered wrongly now that were also answered wrongly last time in this mode. */
  repeatFailures: number;
  averageSeconds: number;
  /** The app's memory footprint after the run, when the phone reports it. */
  memoryMB?: number;
  /** Claims in the ledger at the time, so a result can be read against how much had been learned. */
  claimsStored?: number;
  items: ItemResult[];
}
export interface ExamResult { id: string; version: string; mode: ExamMode; metrics: ExamMetrics; at: string }

const has = (answer: string, wording: string) => answer.toLowerCase().includes(wording.toLowerCase().trim());

/** Facts found, the share of them, and whether the answer used a forbidden wording. No model involved. */
export function scoreAnswer(answer: string, expected: Expected): { score: number; correct: boolean; outdated: boolean } {
  const text = answer.replace(/\[\d+\]/g, ' ');
  const spelled = `${text} ${numbersIn(text).join(' ')}`;
  const found = expected.facts.filter((alts) => alts.some((w) => has(spelled, w))).length;
  const outdated = (expected.forbid ?? []).some((w) => w.trim() && has(text, w));
  const score = expected.facts.length ? found / expected.facts.length : 0;
  return { score, correct: score === 1 && !outdated, outdated };
}

export interface Answered { text: string; /** The numbered sources the model was given (none for the model alone). */ sourceCount: number }
export type Answerer = (item: ExamItem, mode: ExamMode) => Promise<Answered>;

/** Runs every item in one mode. The answerer is the model plus whatever retrieval the mode allows; scoring stays here. */
export async function runExam(input: { items: ExamItem[]; mode: ExamMode; answer: Answerer; previousFailures?: string[]; now?: () => number }): Promise<ExamMetrics> {
  const now = input.now ?? Date.now;
  const results: ItemResult[] = [];
  let unsupported = 0;
  for (const item of input.items) {
    const started = now();
    const answered = await input.answer(item, input.mode);
    const seconds = (now() - started) / 1000;
    const scored = scoreAnswer(answered.text, item.expected);
    unsupported += citedNumbers(answered.text).filter((n) => n < 1 || n > answered.sourceCount).length;
    results.push({ id: item.id, ...scored, seconds });
  }
  const correct = results.filter((r) => r.correct).length;
  const failed = new Set(input.previousFailures ?? []);
  return {
    total: results.length, correct, accuracy: results.length ? correct / results.length : 0,
    outdatedAnswers: results.filter((r) => r.outdated).length, unsupportedCitations: unsupported,
    repeatFailures: results.filter((r) => !r.correct && failed.has(r.id)).length,
    averageSeconds: results.length ? results.reduce((a, r) => a + r.seconds, 0) / results.length : 0, items: results,
  };
}

const isoNow = () => new Date().toISOString();
const SAME_QUESTION = 0.8;
/** Fewer questions than this cannot support a claim of improvement. */
const MIN_QUESTIONS = 5;

/** Exam questions and results, kept apart from the study questions and the claims so the exam never leaks into learning. */
export class ExamStore {
  constructor(private readonly db: LearningKnowledgeDb) {}

  addItem(item: Omit<ExamItem, 'id'>): string {
    const id = `exam:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
    this.db.sql('INSERT INTO atlas_exam_items (id, subject_id, topic, question, expected_json, created_at) VALUES (?,?,?,?,?,?)',
      [id, item.subjectId, item.topic, item.question.trim(), JSON.stringify(item.expected), isoNow()]);
    return id;
  }

  removeItem(id: string): void { this.db.sql('DELETE FROM atlas_exam_items WHERE id = ?', [id]); }

  items(subjectId: string): ExamItem[] {
    return (this.db.sql('SELECT * FROM atlas_exam_items WHERE subject_id = ? ORDER BY created_at', [subjectId]).rows ?? []).map((r: any) => ({
      id: String(r.id), subjectId: String(r.subject_id), topic: String(r.topic), question: String(r.question), expected: JSON.parse(String(r.expected_json)) as Expected,
    }));
  }

  /** True when a question is (nearly) one of the exam's. Study questions and training data must not contain these. */
  isExamQuestion(question: string): boolean {
    return (this.db.sql('SELECT question FROM atlas_exam_items').rows ?? []).some((r: any) => similarity(question, String(r.question)) >= SAME_QUESTION);
  }

  saveResult(mode: ExamMode, metrics: ExamMetrics): void {
    this.db.sql('INSERT INTO atlas_exam_results (id, benchmark_version, mode, metrics_json, created_at) VALUES (?,?,?,?,?)',
      [`result:${Date.now().toString(36)}:${mode}`, BENCHMARK_VERSION, mode, JSON.stringify(metrics), isoNow()]);
  }

  /** Newest first. */
  history(limit = 12): ExamResult[] {
    return (this.db.sql('SELECT * FROM atlas_exam_results ORDER BY created_at DESC LIMIT ?', [limit]).rows ?? []).map((r: any) => ({
      id: String(r.id), version: String(r.benchmark_version), mode: r.mode as ExamMode, metrics: JSON.parse(String(r.metrics_json)) as ExamMetrics, at: String(r.created_at),
    }));
  }

  /** The questions a mode got wrong last time, to spot a mistake that is made again. */
  lastFailures(mode: ExamMode): string[] {
    const last = this.history(40).find((r) => r.mode === mode && r.version === BENCHMARK_VERSION);
    return last ? last.metrics.items.filter((i) => !i.correct).map((i) => i.id) : [];
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * What the measurements say. An improvement is claimed only when the latest run with memory beats the latest run
 * without it, on the same version of the exam, over enough questions. Otherwise it says there is not enough to claim.
 */
export function improvementSummary(history: ExamResult[]): string {
  const latest = (mode: ExamMode) => history.find((r) => r.mode === mode && r.version === BENCHMARK_VERSION);
  const base = latest('baseline');
  const memory = latest('memory');
  if (!base || !memory) return 'Run the exam in the model alone mode and the stored memory mode to see whether memory helps.';
  if (Math.min(base.metrics.total, memory.metrics.total) < MIN_QUESTIONS) return `Fewer than ${MIN_QUESTIONS} questions: too few to say whether anything improved.`;
  const delta = memory.metrics.accuracy - base.metrics.accuracy;
  if (delta > 0) return `With sources and stored memory the answers were right ${pct(memory.metrics.accuracy)} of the time, against ${pct(base.metrics.accuracy)} for the model alone (${Math.round(delta * 100)} points better on ${memory.metrics.total} questions).`;
  return `No measured improvement: ${pct(memory.metrics.accuracy)} with sources and stored memory against ${pct(base.metrics.accuracy)} for the model alone.`;
}
