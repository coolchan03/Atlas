import type { LearningKnowledgeDb } from './knowledgeDb';
import { citedNumbers } from './evidenceGate';
import { numbersIn, similarity, wordsToDigits } from './claimText';

/** The three ways the same questions are answered, so retrieval and memory can be measured against the model alone. */
export type ExamMode = 'baseline' | 'sources' | 'memory';
export const EXAM_MODES: ExamMode[] = ['baseline', 'sources', 'memory'];
export const EXAM_MODE_LABEL: Record<ExamMode, string> = { baseline: 'The model alone', sources: 'With sources', memory: 'With sources and stored memory' };

/** Bump when scoring changes, so results from different rules are never compared. */
export const BENCHMARK_VERSION = '2'; // 2: wording-tolerant matching (reordered words, equivalent numbers and units), per-answer reasons, ungraded items

export interface Expected {
  /** Each entry is a fact; any one of its wordings counts ("one minute", "1 minute", "60 seconds"). */
  facts: string[][];
  /** Wordings that must not appear: out-of-date figures, or the common wrong answer. */
  forbid?: string[];
}
export interface ExamItem { id: string; subjectId: string; topic: string; question: string; expected: Expected }

/**
 * Why an answer did not pass (or that it did). Only 'wrong-answer' and 'outdated' say the model was wrong; the rest say the exam
 * could not fairly judge it, and those items are left out of the accuracy.
 */
export type ExamReason = 'correct' | 'wrong-answer' | 'outdated' | 'empty-answer' | 'no-sources' | 'no-approved-memory' | 'invalid-key' | 'inference-failure';
interface ItemResult {
  id: string; correct: boolean; score: number; outdated: boolean; seconds: number;
  /** Absent in results saved by benchmark version 1. */
  reason?: ExamReason;
  /** Facts the answer did not contain (the first wording of each). */
  missing?: string[];
  /** The answer the model gave (shortened), and what went wrong when it could not answer. */
  answer?: string;
  error?: string;
  sourceCount?: number;
  memoryCount?: number;
}
export interface ExamMetrics {
  /** Questions asked. Accuracy is measured over the ones that could be graded (total minus ungraded). */
  total: number;
  /** True for a run of only some questions (a retest). It is kept in the history, but never counts in the memory-versus-model comparison. */
  retest?: boolean;
  /** Questions that could not be graded: the model failed to answer, or the answer key was unusable. */
  ungraded?: number;
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

const NEGATORS = new Set(['not', 'no', 'never', 'nor', 'neither', 'cannot', 'without']);
const isNegator = (w: string) => NEGATORS.has(w) || w.endsWith("n't");
const FILLER = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'that', 'this', 'with', 'from', 'has', 'have', 'had', 'its', 'but', 'can', 'will', 'may', 'than', 'then', 'into', 'also', 'each', 'any', 'all', 'who', 'what', 'when', 'where', 'which', 'their', 'there', 'they', 'them', 'been', 'being', 'such', 'only', 'more', 'most', 'some', 'other', 'about', 'over', 'under', 'should', 'would', 'could', 'must', 'does', 'did', 'out', 'use', 'used', 'uses', 'using']);
const COPULA = new Set(['is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'will', 'should', 'must', 'would']);
const SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 };

/**
 * One spelling for the same quantity, applied to answer and wording alike: "1,200", "$1200" and "1200 dollars" agree, "50 percent" and
 * "50%" agree, "one minute" and "60 seconds" agree, and "straight-line" equals "straight line".
 */
function canonical(text: string): string {
  return wordsToDigits(text.toLowerCase())
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\$\s*(\d+(?:\.\d+)?)/g, '$1 dollars ')
    .replace(/(\d)\s*(?:%|per\s?cent|percent)/g, '$1 percent ')
    .replace(/\b(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?\b/g, (_m, n: string, u: string) => `${Number((Number(n) * SECONDS[u]).toFixed(3))} secs `)
    .replace(/[\u2010-\u2015-]/g, ' ')
    .replace(/\s+/g, ' ');
}

const wordList = (text: string) => (canonical(text).match(/\d+(?:\.\d+)?|[a-z']+/g) ?? []);
const stemWord = (w: string) => (/^\d/.test(w) ? w : w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** True when the wording appears as whole words/numbers and is not negated right before ("not 20", "isn't 20"), so "120" never matches "20". */
const has = (answer: string, wording: string) => {
  const w = canonical(wording).trim();
  if (!w) return false;
  const a = canonical(answer);
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9.])${esc}(?![a-z0-9]|\\.\\d)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(a))) {
    const before = a.slice(0, m.index + m[1].length).trimEnd();
    const after = a.slice(m.index + m[0].length);
    const negatedAfter = /^\s*(?:(?:is|are|was|were|does|do|did|can|will|should|must|would)\s+)?(?:not|never)\b|^\s*(?:is|are|does|do|did|can|won|should)n't\b/.test(after);
    if (!negatedAfter && !/(?:\bnot|\bno|\bnever|n't|\bnor|\bneither|\bwithout)(?:\s+(?:a|an|the|any|really|always))?$/.test(before)) return true;
  }
  return false;
};

/**
 * True when every meaningful word and number of a multi-word wording appears close together in the answer, in any order and with
 * plural/singular forms ("the lease liability is recorded" matches "recorded lease liabilities"). A negation inside or just before
 * that stretch rejects it, and numbers must match exactly, so "20 percent" never matches "120 percent" or "not 20 percent".
 */
function hasTogether(answer: string, wording: string): boolean {
  // A number and its unit must stay next to each other, which the exact-phrase check already requires: "35 years ... 21 percent" is not "35 percent".
  if (/\d/.test(canonical(wording))) return false;
  const need = [...new Set(wordList(wording).filter((w) => /^\d/.test(w) || (w.length >= 3 && !FILLER.has(w))).map(stemWord))];
  if (need.length < 2) return false;
  const raw = wordList(answer);
  const seq = raw.map(stemWord);
  const maxSpan = need.length * 2 + 6;
  for (let start = 0; start < seq.length; start += 1) {
    if (!need.includes(seq[start])) continue;
    const seen = new Set<string>();
    for (let end = start; end < seq.length && end - start < maxSpan; end += 1) {
      if (need.includes(seq[end])) seen.add(seq[end]);
      if (seen.size === need.length) {
        const tail = raw.slice(end + 1, end + 3);
        const afterIdx = COPULA.has(tail[0]) ? 1 : 0;
        const negated = raw.slice(Math.max(0, start - 2), end + 1).some(isNegator) || (!!tail[afterIdx] && isNegator(tail[afterIdx]));
        if (!negated) return true;
        break;
      }
    }
  }
  return false;
}

const matches = (answer: string, wording: string) => has(answer, wording) || hasTogether(answer, wording);

export interface Score { score: number; correct: boolean; outdated: boolean; missing: string[] }

/** Facts found, the share of them, and whether the answer used a forbidden wording. No model involved. */
export function scoreAnswer(answer: string, expected: Expected): Score {
  const text = answer.replace(/\[\d+\]/g, ' ');
  const unnegated = text.replace(/\b(?:not|no|never|nor|neither|\w+n't)\s+[$]?[\d.,]+/gi, ' '); // a negated figure is not an answer
  const spelled = `${text} ${numbersIn(unnegated).join(' ')}`;
  const hit = expected.facts.map((alts) => alts.some((w) => matches(spelled, w)));
  const found = hit.filter(Boolean).length;
  const outdated = (expected.forbid ?? []).some((w) => w.trim() && matches(text, w));
  const score = expected.facts.length ? found / expected.facts.length : 0;
  const missing = expected.facts.filter((_, i) => !hit[i]).map((alts) => alts[0]);
  return { score, correct: score === 1 && !outdated, outdated, missing };
}

/** An answer key a person can have saved but nothing can be graded against: no facts, or only blank wordings. */
const isUsableKey = (expected: Expected | undefined): boolean => !!expected && Array.isArray(expected.facts) && expected.facts.length > 0 && expected.facts.every((alts) => Array.isArray(alts) && alts.some((w) => String(w).trim()));

interface Answered {
  text: string;
  /** The numbered sources the model was given (none for the model alone). */
  sourceCount: number;
  /** Stored, approved notes the model was given (only in the memory mode). */
  memoryCount?: number;
}
export type Answerer = (item: ExamItem, mode: ExamMode) => Promise<Answered>;

const clip = (t: string, n = 600) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Scores one answer and says why it passed or not. */
function gradeItem(item: ExamItem, mode: ExamMode, answered: Answered & { seconds: number }): ItemResult {
  const { seconds } = answered;
  const text = String(answered.text ?? '');
  const scored = scoreAnswer(text, item.expected);
  const noEvidence = !scored.correct && !scored.outdated;
  let reason: ExamReason = scored.correct ? 'correct' : scored.outdated ? 'outdated' : 'wrong-answer';
  if (!text.trim()) reason = 'empty-answer';
  else if (noEvidence && mode !== 'baseline' && answered.sourceCount === 0 && !answered.memoryCount) reason = 'no-sources';
  else if (noEvidence && mode === 'memory' && answered.memoryCount === 0) reason = 'no-approved-memory';
  return {
    id: item.id, correct: scored.correct, score: scored.score, outdated: scored.outdated, seconds, reason, missing: scored.missing,
    answer: clip(text), sourceCount: answered.sourceCount, memoryCount: answered.memoryCount,
  };
}

/** Runs every item in one mode. The answerer is the model plus whatever retrieval the mode allows; scoring stays here. */
export async function runExam(input: { items: ExamItem[]; mode: ExamMode; answer: Answerer; previousFailures?: string[]; now?: () => number }): Promise<ExamMetrics> {
  const now = input.now ?? Date.now;
  const results: ItemResult[] = [];
  let unsupported = 0;
  for (const item of input.items) {
    const started = now();
    if (!isUsableKey(item.expected)) {
      results.push({ id: item.id, correct: false, score: 0, outdated: false, seconds: 0, reason: 'invalid-key' });
      continue;
    }
    let answered: Answered;
    try {
      answered = await input.answer(item, input.mode);
    } catch (e: any) {
      // A model or retrieval failure is not a wrong answer: record why, and carry on with the next question.
      results.push({ id: item.id, correct: false, score: 0, outdated: false, seconds: (now() - started) / 1000, reason: 'inference-failure', error: clip(String(e?.message || e), 200) });
      continue;
    }
    results.push(gradeItem(item, input.mode, { ...answered, seconds: (now() - started) / 1000 }));
    unsupported += citedNumbers(String(answered.text ?? '')).filter((n) => n < 1 || n > answered.sourceCount).length;
  }
  const ungraded = results.filter((r) => r.reason === 'invalid-key' || r.reason === 'inference-failure').length;
  const graded = results.length - ungraded;
  const correct = results.filter((r) => r.correct).length;
  const failed = new Set(input.previousFailures ?? []);
  return {
    total: results.length, ungraded, correct, accuracy: graded ? correct / graded : 0,
    outdatedAnswers: results.filter((r) => r.outdated).length, unsupportedCitations: unsupported,
    repeatFailures: results.filter((r) => !r.correct && failed.has(r.id)).length,
    averageSeconds: results.length ? results.reduce((a, r) => a + r.seconds, 0) / results.length : 0, items: results,
  };
}

/** Short plain-language cause for each kind of failure, for the results screen. */
export const REASON_LABEL: Record<ExamReason, string> = {
  correct: 'Right',
  'wrong-answer': 'The answer left out or changed a required fact',
  outdated: 'The answer used a figure marked out of date or wrong',
  'empty-answer': 'The model gave no answer',
  'no-sources': 'No source was found for this question, so the model had nothing to read',
  'no-approved-memory': 'No approved stored note matched this question',
  'invalid-key': 'The answer key is empty or unusable, so this question was not graded',
  'inference-failure': 'The model failed to answer, so this question was not graded',
};

/** How many questions of a run ended in each reason, most common first. Undefined for results saved before reasons existed. */
export function reasonCounts(metrics: ExamMetrics): Array<{ reason: ExamReason; count: number }> {
  if (!metrics.items.some((i) => i.reason)) return [];
  const tally = new Map<ExamReason, number>();
  metrics.items.forEach((i) => { if (i.reason && i.reason !== 'correct') tally.set(i.reason, (tally.get(i.reason) ?? 0) + 1); });
  return [...tally.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/**
 * Turns what a person typed into expected facts: one fact per line, alternative wordings separated by "|",
 * and wordings that must not appear separated by commas or new lines.
 */
export function parseExpected(factsText: string, forbidText = ''): Expected {
  const facts = factsText.split('\n').map((line) => line.split('|').map((w) => w.trim()).filter(Boolean)).filter((alts) => alts.length);
  const forbid = forbidText.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
  return forbid.length ? { facts, forbid } : { facts };
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

  /** Every exam question, whatever the subject: what training data and study questions must stay clear of. */
  allQuestions(): string[] {
    return (this.db.sql('SELECT question FROM atlas_exam_items').rows ?? []).map((r: any) => String(r.question));
  }

  /** True when a question is (nearly) one of the exam's. Study questions and training data must not contain these. */
  isExamQuestion(question: string): boolean {
    return this.allQuestions().some((q) => similarity(question, q) >= SAME_QUESTION);
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
    const last = this.history(40).find((r) => r.mode === mode && r.version === BENCHMARK_VERSION && !r.metrics.retest);
    return last ? last.metrics.items.filter((i) => !i.correct).map((i) => i.id) : [];
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * What the measurements say. An improvement is claimed only when the latest run with memory beats the latest run
 * without it, on the same version of the exam, over enough questions. Otherwise it says there is not enough to claim.
 */
export function improvementSummary(history: ExamResult[]): string {
  const latest = (mode: ExamMode) => history.find((r) => r.mode === mode && r.version === BENCHMARK_VERSION && !r.metrics.retest);
  const base = latest('baseline');
  const memory = latest('memory');
  if (!base || !memory) return 'Run the exam in the model alone mode and the stored memory mode to see whether memory helps.';
  if (Math.min(base.metrics.total - (base.metrics.ungraded ?? 0), memory.metrics.total - (memory.metrics.ungraded ?? 0)) < MIN_QUESTIONS) return `Fewer than ${MIN_QUESTIONS} questions: too few to say whether anything improved.`;
  const delta = memory.metrics.accuracy - base.metrics.accuracy;
  if (delta > 0) return `With sources and stored memory the answers were right ${pct(memory.metrics.accuracy)} of the time, against ${pct(base.metrics.accuracy)} for the model alone (${Math.round(delta * 100)} points better on ${memory.metrics.total} questions).`;
  return `No measured improvement: ${pct(memory.metrics.accuracy)} with sources and stored memory against ${pct(base.metrics.accuracy)} for the model alone.`;
}

/** What to retest next: the questions the newest run (of the current scoring version) got wrong, with why. Empty when nothing was missed. */
export function retestNote(history: ExamResult[]): string {
  const latest = history.find((r) => r.version === BENCHMARK_VERSION);
  if (!latest) return history.length ? 'Earlier results used older scoring rules, so they are not compared. Run the exam again.' : '';
  const missed = latest.metrics.items.filter((i) => !i.correct && i.reason !== 'invalid-key' && i.reason !== 'inference-failure');
  const ungraded = latest.metrics.ungraded ?? 0;
  const parts: string[] = [];
  if (missed.length) parts.push(`${missed.length} question${missed.length === 1 ? '' : 's'} missed in the last "${EXAM_MODE_LABEL[latest.mode]}" run: run the exam again to retest ${missed.length === 1 ? 'it' : 'them'}.`);
  if (ungraded) parts.push(`${ungraded} could not be graded (answer key or model problem), so they say nothing about what was learned.`);
  return parts.join(' ');
}

// ------------------------------------------------------------------ retests and answer history
export interface Attempt { at: string; mode: ExamMode; correct: boolean; reason?: ExamReason; answer?: string; missing?: string[]; version: string }

/** Every recorded attempt at one question, newest first (older scoring versions are kept, and marked, never mixed into the schedule). */
export function attemptsFor(history: ExamResult[], itemId: string): Attempt[] {
  return history
    .flatMap((r) => r.metrics.items.filter((i) => i.id === itemId).map((i) => ({ at: r.at, mode: r.mode, correct: i.correct, reason: i.reason, answer: i.answer, missing: i.missing, version: r.version })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Days to wait before retesting a question that has been missed 1, 2, 3... times in a row. */
const RETEST_DAYS = [1, 3, 7];
const DAY = 86_400_000;
const UNGRADED: ExamReason[] = ['invalid-key', 'inference-failure'];

/**
 * Questions due for a retest. Each mode is judged on its own history, because one run asks the same question in every mode (that is
 * one attempt, not three misses): the model alone failing says nothing about what was learned, so it counts only when it is the only
 * mode ever run. A question is due when, in a counted mode, its latest graded attempt was wrong and enough days have passed since it,
 * waiting 1, 3, then 7 days for the 1st, 2nd and later consecutive misses in that mode. Passed, never asked, or only ungraded: not due.
 */
export function dueRetests(items: Array<{ id: string }>, history: ExamResult[], now: Date = new Date()): string[] {
  return items.filter(({ id }) => {
    const graded = attemptsFor(history, id).filter((a) => a.version === BENCHMARK_VERSION && !(a.reason && UNGRADED.includes(a.reason)));
    const counted = graded.some((a) => a.mode !== 'baseline') ? graded.filter((a) => a.mode !== 'baseline') : graded;
    return EXAM_MODES.some((mode) => {
      const own = counted.filter((a) => a.mode === mode); // newest first
      if (!own.length || own[0].correct) return false;
      let misses = 0;
      for (const a of own) { if (a.correct) break; misses += 1; }
      const wait = RETEST_DAYS[Math.min(misses, RETEST_DAYS.length) - 1] * DAY;
      return now.getTime() - new Date(own[0].at).getTime() >= wait;
    });
  }).map((i) => i.id);
}
