import type { LearningKnowledgeDb } from './knowledgeDb';
import { similarity } from './claimText';

const isoNow = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

export interface Experience { id: string; topic: string; attempt: string; outcome: string; correction: string | null; at: string }
export interface Procedure { id: string; topic: string; method: string; status: string; provenance: string }

/**
 * Experience memory (what was tried, what went wrong and the correction) and procedural memory (reusable ways of working).
 * Both are kept apart from factual claims. A procedure starts unverified: a model's suggestion is not a trusted rule.
 */
export class MemoryLedger {
  constructor(private readonly db: LearningKnowledgeDb) {}

  recordExperience(e: { topic: string; attempt: string; outcome: string; correction?: string }): void {
    this.db.sql('INSERT INTO atlas_experience (id, topic, attempt, outcome, correction, created_at) VALUES (?,?,?,?,?,?)',
      [newId('exp'), e.topic, e.attempt.slice(0, 600), e.outcome, e.correction?.slice(0, 600) ?? null, isoNow()]);
  }

  recentExperience(topic: string, limit = 10): Experience[] {
    return (this.db.sql('SELECT * FROM atlas_experience WHERE topic = ? ORDER BY created_at DESC LIMIT ?', [topic, limit]).rows ?? [])
      .map((r: any) => ({ id: String(r.id), topic: String(r.topic), attempt: String(r.attempt), outcome: String(r.outcome), correction: r.correction ? String(r.correction) : null, at: String(r.created_at) }));
  }

  /** Attempts that failed more than once: the same mistake being made again. */
  repeatFailures(topic: string, minimum = 2): Array<{ attempt: string; times: number }> {
    return (this.db.sql("SELECT attempt, COUNT(*) AS times FROM atlas_experience WHERE topic = ? AND outcome IN ('failed','wrong','disputed') GROUP BY attempt HAVING COUNT(*) >= ? ORDER BY times DESC LIMIT 10",
      [topic, minimum]).rows ?? []).map((r: any) => ({ attempt: String(r.attempt), times: Number(r.times) }));
  }

  /** Saves a strategy unless a very similar one is already kept. Returns whether it was new. */
  saveProcedure(p: { topic: string; method: string; provenance: string }): boolean {
    const known = this.procedures(p.topic, 100);
    if (known.some((k) => similarity(k.method, p.method) >= 0.8)) return false;
    const now = isoNow();
    this.db.sql('INSERT INTO atlas_procedures (id, topic, method, verification_status, provenance, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [newId('proc'), p.topic, p.method.slice(0, 600), 'unverified', p.provenance, now, now]);
    return true;
  }

  procedures(topic: string, limit = 20): Procedure[] {
    return (this.db.sql('SELECT * FROM atlas_procedures WHERE topic = ? ORDER BY created_at DESC LIMIT ?', [topic, limit]).rows ?? [])
      .map((r: any) => ({ id: String(r.id), topic: String(r.topic), method: String(r.method), status: String(r.verification_status), provenance: String(r.provenance) }));
  }
}
