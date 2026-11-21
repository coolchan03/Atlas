import type { LearningKnowledgeDb } from './knowledgeDb';
import { citedNumbers } from './evidenceGate';
import { checkSupport, numbersIn, similarity, wordsToDigits } from './claimText';
import { fingerprint, whyNotComparable } from './examCompare';
export { whyNotComparable };

/** The three ways the same questions are answered, so retrieval and memory can be measured against the model alone. */
export type ExamMode = 'baseline' | 'sources' | 'memory';
export const EXAM_MODES: ExamMode[] = ['baseline', 'sources', 'memory'];
export const EXAM_MODE_LABEL: Record<ExamMode, string> = { baseline: 'The model alone', sources: 'With sources', memory: 'With sources and stored memory' };

/** Bump when scoring changes, so results from different rules are never compared. */
export const BENCHMARK_VERSION = '3'; // 3: partial credit (an answer with most of the facts is mostly right and is not retested); 2: wording-tolerant matching (reordered words, equivalent numbers and units), per-answer reasons, ungraded items

/** An answer holding at least this share of the facts, and nothing the key forbids, is accepted as mostly right: it earns that share as credit and is not retested. */
const ACCEPT_SHARE = 0.6;

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
export type ExamReason = 'correct' | 'wrong-answer' | 'outdated' | 'empty-answer' | 'no-sources' | 'no-approved-memory' | 'invalid-key' | 'inference-failure' | 'stopped';
/** The reasons that mean a question was not graded, so it says nothing about what was learned. */
const NOT_GRADED: ExamReason[] = ['invalid-key', 'inference-failure', 'stopped'];
interface ItemResult {
  id: string; correct: boolean; score: number; outdated: boolean; seconds: number;
  /** What the answer earns: 1 when right, the share of facts it held when partly right, 0 when it used a forbidden wording. */
  credit?: number;
  /** The Judge's second opinion on an answer the word matching did not pass ('yes': all the facts in other words; 'partly': some of them). It only ever raises a result. */
  judged?: 'yes' | 'partly';
  /** Absent in results saved by benchmark version 1. */
  reason?: ExamReason;
  /** Facts the answer did not contain (the first wording of each). */
  missing?: string[];
  /** The answer the model gave (shortened), and what went wrong when it could not answer. */
  answer?: string;
  error?: string;
  sourceCount?: number;
  memoryCount?: number;
  /**
   * Whether a right answer was backed by evidence, which is a different question from whether it was right. 'supported': it cites a source it
   * was given (and the cited text contains what it says, when the text is known). 'unsupported': it may be right, but nothing it cites backs it,
   * so it does not show the sources helped. 'not-applicable': the model alone, or the answer was not right or not graded.
   */
  evidence?: ItemEvidence;
}
export type ItemEvidence = 'supported' | 'unsupported' | 'not-applicable';

/** Which questions, which subject, which model and which grading rules a run used. Runs are only compared when all of these match. */
export interface ExamContext { subjectId: string; questionSet: string; model: string; grading: string }
export interface ExamMetrics {
  /** Questions asked. Accuracy is measured over the ones that could be graded (total minus ungraded). */
  total: number;
  /** True when a Judge's second opinion was available for this run: runs with and without one are not compared. */
  secondOpinion?: boolean;
  /** True for a run of only some questions (a retest). It is kept in the history, but never counts in the memory-versus-model comparison. */
  retest?: boolean;
  /** Questions that could not be graded: the model failed to answer, or the answer key was unusable. */
  ungraded?: number;
  correct: number;
  /** Answers accepted as mostly right without being fully right (at least ACCEPT_SHARE of the facts). */
  mostlyRight?: number;
  /** Credit earned over the questions that could be graded: right answers count in full, mostly right ones by their share of the facts. */
  accuracy: number;
  /**
   * Like `accuracy`, but in the modes that give sources an answer earns credit only when it is backed by evidence. Right answers that cite nothing
   * they were given are counted separately (`unsupportedCorrect`) rather than as proof that the sources or memory helped. Absent in older results.
   */
  supportedAccuracy?: number;
  /** Right (or mostly right) answers that came with a valid citation, and ones that did not. Only counted in the modes that give sources. */
  supportedCorrect?: number;
  unsupportedCorrect?: number;
  /** What this run was about, for comparing runs only with comparable ones. Absent in older results. */
  context?: ExamContext;
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
function markNegatives(text: string): string {
  return text
    // A loss in brackets, "($1,200)" or "(1,200.50)": the brackets are the sign. A bare "(2)" is a clause number and stays.
    .replace(/\(\s?(\$?)\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s?(%?)\s?\)/g, (...g: string[]) => (g[1] || g[3] || g[2].includes(',') || g[2].includes('.') ? ` minus ${g[1]}${g[2]}${g[3]} ` : g[0]))
    .replace(/\bnegative\s+(?=\$?\s?\d)/g, 'minus ')
    .replace(/(^|[\s(=:])[-\u2212]\s?(\$?)\s?(?=\d)/g, '$1 minus $2') // "-5000", "-$5,000"
    .replace(/(^|[\s(=:])\$\s?[-\u2212]\s?(?=\d)/g, '$1 minus $$'); // "$-5,000"
}

function canonical(text: string): string {
  // The sign is turned into the word "minus" BEFORE hyphens become spaces below; otherwise "-5000" read as "5000" and a loss matched a gain.
  return markNegatives(wordsToDigits(text.toLowerCase()))
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
    if (!negatedAfter && !/(?:\bnot|\bno|\bnever|n't|\bnor|\bneither|\bwithout)(?:\s+(?:a|an|the|any|really|always))?$|\bminus$/.test(before)) return true; // "minus 5000" is not "5000"
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
  /** The text of those sources in order (passage 1 first), when the caller has it: lets the exam check that a citation really backs the answer. */
  passages?: string[];
  /** Stored, approved notes the model was given (only in the memory mode). */
  memoryCount?: number;
}
export type Answerer = (item: ExamItem, mode: ExamMode) => Promise<Answered>;
/** A second opinion on an answer the matching did not pass: does it hold the key facts in other words? */
export type SecondOpinion = (item: ExamItem, answer: string) => Promise<'yes' | 'partly' | 'no' | null>;

const clip = (t: string, n = 600) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Is a right answer backed by a source it was given? Only meaningful in the modes that give sources, and only for an answer that earned credit. */
function evidenceOf(mode: ExamMode, answered: Answered & { text: string }, accepted: boolean): ItemEvidence {
  const { text } = answered;
  if (mode === 'baseline' || !accepted) return 'not-applicable';
  const valid = citedNumbers(text).filter((n) => n >= 1 && n <= answered.sourceCount);
  if (!valid.length) return 'unsupported';
  if (answered.passages?.length) {
    const cited = valid.map((n) => answered.passages?.[n - 1] ?? '').filter(Boolean);
    // The text of the cited sources is known: it must contain what the answer states (its figures and enough of its words).
    if (cited.length && checkSupport(text.replace(/\[\d+\]/g, ' '), cited).supported === false) return 'unsupported';
  }
  return 'supported';
}

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
  const credit = scored.outdated || reason === 'no-sources' || reason === 'no-approved-memory' ? 0 : scored.score;
  return {
    id: item.id, correct: scored.correct, score: scored.score, credit, outdated: scored.outdated, seconds, reason, missing: scored.missing,
    answer: clip(text), sourceCount: answered.sourceCount, memoryCount: answered.memoryCount,
    evidence: evidenceOf(mode, { ...answered, text }, credit >= ACCEPT_SHARE && !scored.outdated),
  };
}

/** An exam run stops after this many answers in a row that earned no credit at all. */
const GIVE_UP_EXAM_AFTER = 5;

/**
 * The word matching cannot see an answer that says the same thing in other words. For an answer it did not pass (and that used no forbidden
 * figure and had evidence), the Judge is asked whether the key facts are all there ('yes': right), some ('partly': mostly right) or not.
 * It can only raise a result, never lower one, and what it did is kept on the result so it can be seen. A Judge that fails changes nothing.
 */
async function withSecondOpinion(asked: { item: ExamItem; fullAnswer: string; judge?: SecondOpinion }, graded: ItemResult): Promise<ItemResult> {
  const { item, fullAnswer, judge } = asked;
  if (!judge || graded.correct || graded.outdated || graded.reason !== 'wrong-answer' || !graded.answer) return graded;
  let verdict: Awaited<ReturnType<SecondOpinion>> = null;
  try { verdict = await judge(item, fullAnswer); } catch (e: any) { if (String(e?.message) === 'stopped') throw e; return graded; } // a Stop ends the exam; a Judge that fails changes nothing
  if (verdict === 'yes') return { ...graded, correct: true, credit: 1, reason: 'correct', judged: 'yes', missing: [] };
  if (verdict === 'partly') return { ...graded, credit: Math.max(graded.credit ?? 0, ACCEPT_SHARE), judged: 'partly' };
  return graded;
}

/** Right, or mostly right (at least ACCEPT_SHARE of the facts and nothing forbidden). */
export const isAccepted = (r: { correct: boolean; credit?: number; outdated: boolean }): boolean => r.correct || (!r.outdated && (r.credit ?? 0) >= ACCEPT_SHARE);

/** Runs every item in one mode. The answerer is the model plus whatever retrieval the mode allows; scoring stays here. */
export async function runExam(input: { items: ExamItem[]; mode: ExamMode; answer: Answerer; previousFailures?: string[]; now?: () => number; giveUpAfter?: number; judge?: SecondOpinion; model?: string }): Promise<ExamMetrics> {
  const now = input.now ?? Date.now;
  const results: ItemResult[] = [];
  let unsupported = 0;
  let missesInARow = 0;
  const giveUpAfter = input.giveUpAfter ?? GIVE_UP_EXAM_AFTER;
  for (const item of input.items) {
    const started = now();
    // Several answers in a row earned nothing: asking the rest only records the same failure, so the run stops here and says so.
    if (missesInARow >= giveUpAfter) { results.push({ id: item.id, correct: false, score: 0, outdated: false, seconds: 0, reason: 'stopped' }); continue; }
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
    const graded = await withSecondOpinion({ item, fullAnswer: String(answered.text ?? ''), judge: input.judge }, gradeItem(item, input.mode, { ...answered, seconds: (now() - started) / 1000 }));
    results.push(graded);
    missesInARow = (graded.credit ?? 0) > 0 ? 0 : missesInARow + 1;
    unsupported += citedNumbers(String(answered.text ?? '')).filter((n) => n < 1 || n > answered.sourceCount).length;
  }
  const ungraded = results.filter((r) => r.reason && NOT_GRADED.includes(r.reason)).length;
  const graded = results.length - ungraded;
  const correct = results.filter((r) => r.correct).length;
  const earned = results.filter((r) => !(r.reason && NOT_GRADED.includes(r.reason))).reduce((a, r) => a + (r.credit ?? (r.correct ? 1 : 0)), 0);
  const failed = new Set(input.previousFailures ?? []);
  const sourced = input.mode !== 'baseline';
  const supportedCredit = results.filter((r) => !(r.reason && NOT_GRADED.includes(r.reason))).reduce((a, r) => a + (sourced && r.evidence === 'unsupported' ? 0 : (r.credit ?? (r.correct ? 1 : 0))), 0);
  return {
    total: results.length, ungraded, secondOpinion: !!input.judge, correct, mostlyRight: results.filter((r) => !r.correct && isAccepted(r)).length, accuracy: graded ? earned / graded : 0,
    supportedAccuracy: graded ? supportedCredit / graded : 0,
    ...(sourced ? { supportedCorrect: results.filter((r) => r.evidence === 'supported').length, unsupportedCorrect: results.filter((r) => r.evidence === 'unsupported').length } : {}),
    context: examContext(input.items, !!input.judge, input.model),
    outdatedAnswers: results.filter((r) => r.outdated).length, unsupportedCitations: unsupported,
    repeatFailures: results.filter((r) => !r.correct && !(r.reason && NOT_GRADED.includes(r.reason)) && failed.has(r.id)).length,
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
  stopped: 'Not asked: the exam stopped after several misses in a row, so this question was not graded',
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
    return last ? last.metrics.items.filter((i) => !isAccepted(i) && !(i.reason && NOT_GRADED.includes(i.reason))).map((i) => i.id) : [];
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What a run was about. The question set is identified by the questions AND their answer keys, so editing a key makes it a different exam. */
export function examContext(items: ExamItem[], judge: boolean, model = ''): ExamContext {
  const subjectId = [...new Set(items.map((i) => i.subjectId))].sort().join(',');
  const questionSet = fingerprint([...items].sort((a, b) => a.id.localeCompare(b.id)).map((i) => `${i.id}\u0001${i.question}\u0001${JSON.stringify(i.expected)}`).join('\u0002'));
  return { subjectId, questionSet, model, grading: `benchmark ${BENCHMARK_VERSION}, ${judge ? 'with' : 'without'} Judge second opinion` };
}

/** The four plain categories for a run's answers: backed by evidence, right but not backed, wrong, and not graded. */
export function evidenceCounts(metrics: ExamMetrics): { supported: number; unsupported: number; incorrect: number; ungraded: number } {
  const ungraded = metrics.items.filter((i) => i.reason && NOT_GRADED.includes(i.reason)).length;
  const accepted = metrics.items.filter((i) => !(i.reason && NOT_GRADED.includes(i.reason)) && isAccepted(i));
  const unsupported = accepted.filter((i) => i.evidence === 'unsupported').length;
  return { supported: accepted.length - unsupported, unsupported, incorrect: metrics.items.length - ungraded - accepted.length, ungraded };
}

/**
 * What the measurements say. An improvement is claimed only when the latest run with memory beats the latest run
 * without it, on the same version of the exam, over enough questions. Otherwise it says there is not enough to claim.
 */
export function improvementSummary(history: ExamResult[]): string {
  const latest = (mode: ExamMode) => history.find((r) => r.mode === mode && r.version === BENCHMARK_VERSION && !r.metrics.retest);
  const base = latest('baseline');
  const memory = latest('memory');
  if (!base || !memory) return 'Run the exam in the model alone mode and the stored memory mode to see whether memory helps.';
  if (!!base.metrics.secondOpinion !== !!memory.metrics.secondOpinion) return 'One run had the Judge reading answers in other words and the other did not, so they were graded differently and cannot be compared. Run the exam again in both modes.';
  if ([base, memory].some((r) => r.metrics.items.some((i) => i.reason === 'stopped'))) return 'A run stopped early after several misses in a row, so the two runs did not answer the same questions and cannot be compared. Fix what is failing, then run the exam again.';
  if (Math.min(base.metrics.total - (base.metrics.ungraded ?? 0), memory.metrics.total - (memory.metrics.ungraded ?? 0)) < MIN_QUESTIONS) return `Fewer than ${MIN_QUESTIONS} questions: too few to say whether anything improved.`;
  const unrelated = whyNotComparable(base.metrics, memory.metrics);
  if (unrelated) return unrelated;
  const delta = memory.metrics.accuracy - base.metrics.accuracy;
  // Right is not the same as backed by evidence: credit that cites nothing it was given does not show that sources or memory helped.
  const backed = memory.metrics.supportedAccuracy ?? memory.metrics.accuracy;
  const backedDelta = backed - base.metrics.accuracy;
  if (delta > 0 && backedDelta <= 0) return `The answers with sources and stored memory were right more often (${pct(memory.metrics.accuracy)} against ${pct(base.metrics.accuracy)}), but ${memory.metrics.unsupportedCorrect ?? 'several'} of the right answers cited nothing they were given, so this does not show the sources or memory helped. Counting only answers backed by a source it is ${pct(backed)}.`;
  if (backedDelta > 0) return `With sources and stored memory the answers were right ${pct(memory.metrics.accuracy)} of the time, against ${pct(base.metrics.accuracy)} for the model alone (${Math.round(delta * 100)} points better on ${memory.metrics.total} questions)${backed < memory.metrics.accuracy ? `; ${pct(backed)} were backed by a cited source` : ''}.`;
  return `No measured improvement: ${pct(memory.metrics.accuracy)} with sources and stored memory against ${pct(base.metrics.accuracy)} for the model alone.`;
}

/** What to retest next: the questions the newest run (of the current scoring version) got wrong, with why. Empty when nothing was missed. */
export function retestNote(history: ExamResult[]): string {
  const latest = history.find((r) => r.version === BENCHMARK_VERSION);
  if (!latest) return history.length ? 'Earlier results used older scoring rules, so they are not compared. Run the exam again.' : '';
  const missed = latest.metrics.items.filter((i) => !isAccepted(i) && !(i.reason && NOT_GRADED.includes(i.reason)));
  const ungraded = latest.metrics.ungraded ?? 0;
  const parts: string[] = [];
  if (missed.length) parts.push(`${missed.length} question${missed.length === 1 ? '' : 's'} missed in the last "${EXAM_MODE_LABEL[latest.mode]}" run: run the exam again to retest ${missed.length === 1 ? 'it' : 'them'}.`);
  if (ungraded) parts.push(`${ungraded} could not be graded (answer key or model problem), so they say nothing about what was learned.`);
  return parts.join(' ');
}

// ------------------------------------------------------------------ retests and answer history
export interface Attempt { at: string; mode: ExamMode; correct: boolean; accepted: boolean; judged?: 'yes' | 'partly'; reason?: ExamReason; answer?: string; missing?: string[]; version: string }

/** Every recorded attempt at one question, newest first (older scoring versions are kept, and marked, never mixed into the schedule). */
export function attemptsFor(history: ExamResult[], itemId: string): Attempt[] {
  return history
    .flatMap((r) => r.metrics.items.filter((i) => i.id === itemId).map((i) => ({ at: r.at, mode: r.mode, correct: i.correct, accepted: r.version === BENCHMARK_VERSION ? isAccepted(i) : i.correct, judged: i.judged, reason: i.reason, answer: i.answer, missing: i.missing, version: r.version })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Days to wait before retesting a question that has been missed 1, 2, 3... times in a row. */
const RETEST_DAYS = [1, 3, 7];
const DAY = 86_400_000;
const UNGRADED = NOT_GRADED;

/**
 * Questions due for a retest. Each mode is judged on its own history, because one run asks the same question in every mode (that is
 * one attempt, not three misses): the model alone failing says nothing about what was learned, so it counts only when it is the only
 * mode ever run. A question is due when, in a counted mode, its latest graded attempt was wrong and enough days have passed since it,
 * waiting 1, 3, then 7 days for the 1st, 2nd and later consecutive misses in that mode. Passed, never asked, or only ungraded: not due.
 */
export function dueRetests(items: Array<{ id: string }>, history: ExamResult[], now: Date = new Date()): string[] {
  return items.filter(({ id }) => {
    // A question the last run never got to (it stopped after repeated misses) is due at once.
    const newest = attemptsFor(history, id)[0];
    if (newest && newest.version === BENCHMARK_VERSION && newest.reason === 'stopped') return true;
    const graded = attemptsFor(history, id).filter((a) => a.version === BENCHMARK_VERSION && !(a.reason && UNGRADED.includes(a.reason)));
    const counted = graded.some((a) => a.mode !== 'baseline') ? graded.filter((a) => a.mode !== 'baseline') : graded;
    return EXAM_MODES.some((mode) => {
      const own = counted.filter((a) => a.mode === mode); // newest first
      if (!own.length || own[0].accepted) return false;
      let misses = 0;
      for (const a of own) { if (a.accepted) break; misses += 1; }
      const wait = RETEST_DAYS[Math.min(misses, RETEST_DAYS.length) - 1] * DAY;
      return now.getTime() - new Date(own[0].at).getTime() >= wait;
    });
  }).map((i) => i.id);
}
