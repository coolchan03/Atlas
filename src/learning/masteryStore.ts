import type { LearningKnowledgeDb } from './knowledgeDb';

/** How well a concept was recalled the last time it was practised. */
export type Outcome = 'correct' | 'partial' | 'wrong';

/** Days until the next review after 1, 2, 3... correct answers in a row: spaced repetition. */
const INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];
const DAY_MS = 86_400_000;
/** A concept is "mastered" once it was recalled correctly this many times running. */
const MASTERED_STREAK = 4;
const SCORE: Record<Outcome, number> = { correct: 1, partial: 0.5, wrong: 0 };

/** One stable id per question, however it is capitalised or punctuated. */
export function conceptId(question: string): string {
  const text = question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `c${h.toString(16)}`;
}

export interface Progress { strength: number; streak: number; attempts: number }

/** What a practice result does to a concept: its strength, its streak and when it is due again. */
export function nextProgress(prev: Progress | null, outcome: Outcome, now: Date): Progress & { nextReview: Date } {
  const streak = outcome === 'correct' ? (prev?.streak ?? 0) + 1 : outcome === 'partial' ? prev?.streak ?? 0 : 0;
  const strength = prev ? prev.strength * 0.6 + SCORE[outcome] * 0.4 : SCORE[outcome] * 0.8;
  let days = 0.25;
  if (outcome === 'partial') days = 1;
  if (outcome === 'correct') days = INTERVAL_DAYS[Math.min(streak - 1, INTERVAL_DAYS.length - 1)];
  return { strength, streak, attempts: (prev?.attempts ?? 0) + 1, nextReview: new Date(now.getTime() + days * DAY_MS) };
}

export interface DueConcept { id: string; question: string; topic: string; strength: number }
export interface MasterySummary { tracked: number; due: number; mastered: number; averageStrength: number }

/** Concept mastery and review scheduling for one learning subject, kept in the knowledge ledger. */
export class MasteryStore {
  /** `clock` is the time source; tests pass their own. */
  constructor(private readonly db: LearningKnowledgeDb, private readonly clock: () => Date = () => new Date()) {}

  record(subjectId: string, concept: { question: string; topic: string }, outcome: Outcome): void {
    const now = this.clock();
    const id = conceptId(concept.question);
    const row = (this.db.sql('SELECT strength, streak, attempts FROM atlas_mastery WHERE concept_id = ?', [id]).rows ?? [])[0] as any;
    const next = nextProgress(row ? { strength: Number(row.strength), streak: Number(row.streak), attempts: Number(row.attempts) } : null, outcome, now);
    this.db.sql(`INSERT INTO atlas_mastery (concept_id, subject_id, topic, question, strength, streak, attempts, last_at, next_review, last_outcome)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(concept_id) DO UPDATE SET strength=excluded.strength, streak=excluded.streak, attempts=excluded.attempts,
        last_at=excluded.last_at, next_review=excluded.next_review, last_outcome=excluded.last_outcome`,
    [id, subjectId, concept.topic, concept.question, next.strength, next.streak, next.attempts, now.toISOString(), next.nextReview.toISOString(), outcome]);
  }

  /** Whether this question is already being tracked, so a later passing report does not reset its practice record. */
  isTracked(question: string): boolean {
    return (this.db.sql('SELECT 1 AS found FROM atlas_mastery WHERE concept_id = ?', [conceptId(question)]).rows ?? []).length > 0;
  }

  /** Concepts whose review time has come, the weakest first. */
  due(subjectId: string, now = new Date(), limit = 3): DueConcept[] {
    return (this.db.sql('SELECT concept_id, question, topic, strength FROM atlas_mastery WHERE subject_id = ? AND next_review <= ? ORDER BY strength ASC, next_review ASC LIMIT ?',
      [subjectId, now.toISOString(), limit]).rows ?? []).map((r: any) => ({ id: String(r.concept_id), question: String(r.question), topic: String(r.topic), strength: Number(r.strength) }));
  }

  summary(subjectId: string, now = new Date()): MasterySummary {
    const r = (this.db.sql(`SELECT COUNT(*) AS tracked, COALESCE(AVG(strength), 0) AS avg,
      SUM(CASE WHEN next_review <= ? THEN 1 ELSE 0 END) AS due, SUM(CASE WHEN streak >= ? THEN 1 ELSE 0 END) AS mastered
      FROM atlas_mastery WHERE subject_id = ?`, [now.toISOString(), MASTERED_STREAK, subjectId]).rows ?? [])[0] as any;
    return { tracked: Number(r?.tracked) || 0, due: Number(r?.due) || 0, mastered: Number(r?.mastered) || 0, averageStrength: Math.round((Number(r?.avg) || 0) * 100) / 100 };
  }
}
