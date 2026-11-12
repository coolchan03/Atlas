/**
 * Atlas's non-destructive claim/evidence ledger.
 * Independent from rag.db and atlas-learning AsyncStorage. Nothing here updates
 * model weights or the existing project documents, lesson files or reports.
 */
import type { ClaimStatus, EvidenceSource } from './evidenceGate';
import { claimSentences } from './claimText';

declare const require: (id: string) => any;

type Params = Array<string | number | null>;
export interface SqlAdapter {
  executeSync(sql: string, params?: Params): { rows?: unknown[]; insertId?: number };
}

export const KNOWLEDGE_DB_NAME = 'atlas_learning_knowledge.db';
/** 2 adds contradictions, mastery and exam items. Opening an older database only adds tables; nothing is dropped or rewritten. */
export const KNOWLEDGE_SCHEMA_VERSION = 2;

export const KNOWLEDGE_DDL = [
  `CREATE TABLE IF NOT EXISTS atlas_sources (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT,
    source_type TEXT NOT NULL, authority TEXT NOT NULL DEFAULT 'unknown',
    publication_date TEXT, retrieved_at TEXT NOT NULL, version_hash TEXT,
    effective_from TEXT, effective_to TEXT, tax_year INTEGER,
    schema_version INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS atlas_claims (
    id TEXT PRIMARY KEY, topic TEXT NOT NULL, question TEXT NOT NULL,
    claim_text TEXT NOT NULL, report_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('candidate','verified','disputed','superseded','rejected')),
    uncertainty TEXT, confidence REAL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_claims_status ON atlas_claims(status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_claims_report ON atlas_claims(report_id)`,
  `CREATE TABLE IF NOT EXISTS atlas_evidence (
    id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, source_id TEXT NOT NULL,
    citation_number INTEGER NOT NULL, passage TEXT, locator TEXT,
    stance TEXT NOT NULL DEFAULT 'cited' CHECK(stance IN ('cited','supporting','contradicting','context')),
    retrieved_at TEXT NOT NULL, FOREIGN KEY(claim_id) REFERENCES atlas_claims(id),
    FOREIGN KEY(source_id) REFERENCES atlas_sources(id))`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_evidence_claim ON atlas_evidence(claim_id)`,
  `CREATE TABLE IF NOT EXISTS atlas_claim_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id TEXT NOT NULL,
    old_status TEXT NOT NULL, new_status TEXT NOT NULL,
    actor TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL,
    FOREIGN KEY(claim_id) REFERENCES atlas_claims(id))`,
  `CREATE TABLE IF NOT EXISTS atlas_report_archive (
    id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, question TEXT NOT NULL,
    report_text TEXT NOT NULL, source_text TEXT NOT NULL,
    source_list_json TEXT NOT NULL, original_timestamp INTEGER NOT NULL,
    judge_status TEXT NOT NULL, judge_score REAL, judge_reason TEXT,
    archived_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atlas_experience (
    id TEXT PRIMARY KEY, topic TEXT NOT NULL, attempt TEXT NOT NULL,
    outcome TEXT NOT NULL, correction TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atlas_procedures (
    id TEXT PRIMARY KEY, topic TEXT NOT NULL, method TEXT NOT NULL,
    verification_status TEXT NOT NULL, provenance TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atlas_exam_results (
    id TEXT PRIMARY KEY, benchmark_version TEXT NOT NULL,
    mode TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atlas_contradictions (
    id TEXT PRIMARY KEY, claim_a TEXT NOT NULL, claim_b TEXT NOT NULL, reason TEXT NOT NULL,
    detected_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT,
    FOREIGN KEY(claim_a) REFERENCES atlas_claims(id), FOREIGN KEY(claim_b) REFERENCES atlas_claims(id))`,
  `CREATE TABLE IF NOT EXISTS atlas_mastery (
    concept_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, topic TEXT NOT NULL, question TEXT NOT NULL,
    strength REAL NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
    last_at TEXT, next_review TEXT NOT NULL, last_outcome TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_mastery_due ON atlas_mastery(subject_id, next_review)`,
  `CREATE TABLE IF NOT EXISTS atlas_exam_items (
    id TEXT PRIMARY KEY, topic TEXT NOT NULL, question TEXT NOT NULL,
    expected_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
];

export interface ReliabilityClaim {
  id: string; question: string; claim: string; topic: string; status: ClaimStatus;
  agentId: string | null; citations: number; sourcePassages: number; updatedAt: string;
}
export interface ReliabilitySnapshot {
  counts: Record<ClaimStatus, number>;
  recent: ReliabilityClaim[];
}

export interface StoredReport {
  id: string; q: string; text: string; sources: string; at: number;
  sourceList?: EvidenceSource[];
  status: 'waiting' | 'pass' | 'fail';
  score?: number; why?: string;
}

export interface CandidateClaim {
  id: string;
  topic: string;
  question: string;
  claimText: string;
  reportId: string;
  status: Extract<ClaimStatus, 'candidate' | 'disputed'>;
  uncertainty: string;
  sources: EvidenceSource[];
  citedNumbers: number[];
  /** Sources the claim does not cite but that share its words: kept as context for a reviewer, never as support. */
  contextNumbers?: number[];
}

const isoNow = (): string => new Date().toISOString();
const nonblank = (s: string, label: string): string => {
  if (!s || !s.trim()) throw new Error(`${label} is required`);
  return s.trim();
};

export class LearningKnowledgeDb {
  private db: SqlAdapter | null = null;
  constructor(private readonly openDb: () => SqlAdapter) {}

  ensureReady(): void {
    if (this.db) return;
    const db = this.openDb();
    const versionRows = db.executeSync('PRAGMA user_version').rows ?? [];
    const version = Number((versionRows[0] as {user_version?: number} | undefined)?.user_version ?? 0);
    if (version > KNOWLEDGE_SCHEMA_VERSION) throw new Error('Knowledge database is newer than this app; refusing to downgrade');
    db.executeSync('PRAGMA foreign_keys = ON');
    db.executeSync('PRAGMA secure_delete = ON');
    // All changes are additive. Do not drop or replace existing tables.
    db.executeSync('BEGIN');
    try {
      for (const ddl of KNOWLEDGE_DDL) db.executeSync(ddl);
      db.executeSync(`PRAGMA user_version = ${KNOWLEDGE_SCHEMA_VERSION}`);
      db.executeSync('COMMIT');
    } catch (error) { db.executeSync('ROLLBACK'); throw error; }
    this.db = db;
  }

  /** Runs one statement. The mastery and exam stores are built on this, so the schema lives in one place. */
  sql(sql: string, params: Params = []): { rows?: unknown[]; insertId?: number } {
    this.ensureReady();
    return this.db!.executeSync(sql, params);
  }

  archiveReport(subjectId: string, r: StoredReport): void {
    nonblank(subjectId, 'subjectId');
    nonblank(r.id, 'report id');
    // INSERT OR IGNORE preserves the earliest original report verbatim.
    this.sql(`INSERT OR IGNORE INTO atlas_report_archive
      (id, subject_id, question, report_text, source_text, source_list_json,
       original_timestamp, judge_status, judge_score, judge_reason, archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      r.id, subjectId, r.q, r.text, r.sources, JSON.stringify(r.sourceList ?? []),
      r.at, r.status, r.score ?? null, r.why ?? null, isoNow(),
    ]);
  }

  saveCandidate(c: CandidateClaim): void {
    nonblank(c.id, 'claim id');
    nonblank(c.topic, 'topic');
    nonblank(c.question, 'question');
    nonblank(c.reportId, 'report id');
    nonblank(c.claimText, 'claim');
    if (c.status !== 'candidate' && c.status !== 'disputed') throw new Error('Automatically saved claims cannot be verified');
    this.ensureReady();
    const db = this.db!;
    const now = isoNow();
    db.executeSync('BEGIN');
    try {
      db.executeSync(`INSERT OR IGNORE INTO atlas_claims
        (id, topic, question, claim_text, report_id, status, uncertainty, confidence, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [c.id, c.topic, c.question, c.claimText, c.reportId, c.status, c.uncertainty, null, now, now]);
      const stances = new Map<number, 'cited' | 'context'>();
      (c.contextNumbers ?? []).forEach((n) => stances.set(n, 'context'));
      c.citedNumbers.forEach((n) => stances.set(n, 'cited'));
      for (const [n, stance] of stances) {
        const source = c.sources.find((s) => s.n === n);
        if (!source) continue;
        // A report-local key is safer than incorrectly conflating same-title documents.
        const sourceId = source.sourceId || `${c.reportId}:source:${n}`;
        db.executeSync(`INSERT OR IGNORE INTO atlas_sources
          (id,kind,title,url,source_type,authority,publication_date,retrieved_at,
           version_hash,effective_from,effective_to,tax_year)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
          sourceId, source.kind, source.title, source.url ?? null,
          source.kind, 'unassessed', source.publicationDate ?? null,
          source.retrievedAt ?? now, null, source.effectiveFrom ?? null,
          source.effectiveTo ?? null, source.taxYear ?? null,
        ]);
        db.executeSync(`INSERT OR IGNORE INTO atlas_evidence
          (id,claim_id,source_id,citation_number,passage,locator,stance,retrieved_at)
          VALUES (?,?,?,?,?,?,?,?)`, [
          `${c.id}:source:${n}`, c.id, sourceId, n, source.passage ?? null,
          source.locator ?? null, stance, source.retrievedAt ?? now,
        ]);
      }
      db.executeSync('COMMIT');
    } catch (error) { db.executeSync('ROLLBACK'); throw error; }
  }

  /** Claims already known on a topic, newest first, for comparing a new claim against. Rejected and superseded ones are skipped. */
  knownClaims(topic: string, limit = 300): Array<{ id: string; text: string; status: ClaimStatus }> {
    return (this.sql("SELECT id, claim_text, status FROM atlas_claims WHERE topic = ? AND status NOT IN ('rejected','superseded') ORDER BY created_at DESC LIMIT ?", [topic, limit]).rows ?? [])
      .map((r) => ({ id: String((r as any).id), text: String((r as any).claim_text), status: (r as any).status as ClaimStatus }));
  }

  /** A second source for a claim already stored: it strengthens the record without making a duplicate. */
  addSupport(claimId: string, source: EvidenceSource & { reportId: string }): void {
    const now = isoNow();
    const sourceId = source.sourceId || `${source.reportId}:source:${source.n}`;
    this.sql(`INSERT OR IGNORE INTO atlas_sources (id,kind,title,url,source_type,authority,publication_date,retrieved_at,version_hash,effective_from,effective_to,tax_year)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [sourceId, source.kind, source.title, source.url ?? null, source.kind, 'unassessed', source.publicationDate ?? null,
      source.retrievedAt ?? now, null, source.effectiveFrom ?? null, source.effectiveTo ?? null, source.taxYear ?? null]);
    this.sql(`INSERT OR IGNORE INTO atlas_evidence (id,claim_id,source_id,citation_number,passage,locator,stance,retrieved_at)
      VALUES (?,?,?,?,?,?,?,?)`, [`${claimId}:support:${sourceId}`, claimId, sourceId, source.n, source.passage ?? null, source.locator ?? null, 'supporting', source.retrievedAt ?? now]);
  }

  /** Moves a candidate or verified claim to disputed because the checks found a conflict. A person can still review it back. */
  flagDisputed(id: string, reason: string): void {
    const claim = this.getClaim(id);
    if (!claim || claim.status === 'disputed' || claim.status === 'rejected' || claim.status === 'superseded') return;
    const now = isoNow();
    this.sql('UPDATE atlas_claims SET status = ?, updated_at = ? WHERE id = ?', ['disputed', now, id]);
    this.sql('INSERT INTO atlas_claim_history (claim_id,old_status,new_status,actor,reason,at) VALUES (?,?,?,?,?,?)', [id, claim.status, 'disputed', 'consistency-check', reason, now]);
  }

  /** Records that two claims conflict. The same pair is recorded once. */
  recordContradiction(a: string, b: string, reason: string): void {
    const [x, y] = [a, b].sort();
    this.sql('INSERT OR IGNORE INTO atlas_contradictions (id,claim_a,claim_b,reason,detected_at) VALUES (?,?,?,?,?)', [`${x}|${y}`, x, y, reason, isoNow()]);
  }

  /** Conflicts nobody has resolved yet, with both claims' text. */
  openContradictions(limit = 20): Array<{ id: string; reason: string; a: { id: string; text: string }; b: { id: string; text: string } }> {
    return (this.sql(`SELECT k.id, k.reason, a.id AS a_id, a.claim_text AS a_text, b.id AS b_id, b.claim_text AS b_text
      FROM atlas_contradictions k JOIN atlas_claims a ON a.id = k.claim_a JOIN atlas_claims b ON b.id = k.claim_b
      WHERE k.resolved_at IS NULL ORDER BY k.detected_at DESC LIMIT ?`, [limit]).rows ?? []).map((r: any) => ({
      id: String(r.id), reason: String(r.reason), a: { id: String(r.a_id), text: String(r.a_text) }, b: { id: String(r.b_id), text: String(r.b_text) },
    }));
  }

  resolveContradiction(id: string, resolution: string): void {
    this.sql('UPDATE atlas_contradictions SET resolved_at = ?, resolution = ? WHERE id = ?', [isoNow(), nonblank(resolution, 'resolution'), id]);
  }

  getClaim(id: string): Record<string, any> | null {
    return (this.sql('SELECT * FROM atlas_claims WHERE id = ?', [id]).rows ?? [])[0] as Record<string, any> ?? null;
  }

  /** Status changes require a distinct, auditable decision. Models never call this automatically. */
  reviewClaim({ id, status, actor, reason }: { id: string; status: ClaimStatus; actor: string; reason: string }): void {
    const claim = this.getClaim(id);
    if (!claim) throw new Error('Claim not found');
    nonblank(actor, 'reviewer');
    nonblank(reason, 'review reason');
    if (status === 'verified') {
      const evidence = this.sql("SELECT * FROM atlas_evidence WHERE claim_id = ? AND passage IS NOT NULL AND trim(passage) != ''", [id]).rows ?? [];
      if (!evidence.length) throw new Error('Verified status requires a traceable source passage');
    }
    const now = isoNow();
    this.sql('BEGIN');
    try {
      this.sql('UPDATE atlas_claims SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
      this.sql('INSERT INTO atlas_claim_history (claim_id,old_status,new_status,actor,reason,at) VALUES (?,?,?,?,?,?)', [id, claim.status, status, actor, reason, now]);
      this.sql('COMMIT');
    } catch (error) { this.sql('ROLLBACK'); throw error; }
  }

  /** Read-only counts and recent provenance for UI. A model judge's PASS is never verified. */
  getReliabilitySnapshot(): ReliabilitySnapshot {
    const counts: Record<ClaimStatus, number> = {
      candidate: 0, verified: 0, disputed: 0, superseded: 0, rejected: 0,
    };
    for (const row of this.sql('SELECT status, COUNT(*) AS total FROM atlas_claims GROUP BY status').rows ?? []) {
      const item = row as { status: ClaimStatus; total: number };
      if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status] = Number(item.total) || 0;
    }
    const recent = (this.sql(`SELECT c.id, c.question, c.claim_text, c.topic, c.status, c.updated_at,
      r.subject_id AS agent_id,
      (SELECT COUNT(*) FROM atlas_evidence e WHERE e.claim_id=c.id) AS citations,
      (SELECT COUNT(*) FROM atlas_evidence e WHERE e.claim_id=c.id AND
        e.passage IS NOT NULL AND trim(e.passage) != '') AS passage_count
      FROM atlas_claims c
      LEFT JOIN atlas_report_archive r ON r.id = c.report_id
      ORDER BY c.updated_at DESC LIMIT 20`).rows ?? []) as Array<Record<string, any>>;
    return { counts, recent: recent.map((r) => ({
      id: String(r.id), question: String(r.question || ''), claim: String(r.claim_text || ''),
      topic: String(r.topic || ''), status: r.status as ClaimStatus,
      agentId: r.agent_id ? String(r.agent_id) : null,
      citations: Number(r.citations) || 0, sourcePassages: Number(r.passage_count) || 0,
      updatedAt: String(r.updated_at || ''),
    })) };
  }

  getClaimSources(id: string): Array<{ title: string; locator: string; passage: string; url: string }> {
    return (this.sql(`SELECT s.title, e.locator, e.passage, s.url FROM atlas_evidence e
      JOIN atlas_sources s ON s.id = e.source_id WHERE e.claim_id = ?
      ORDER BY e.citation_number ASC LIMIT 20`, [id]).rows ?? []).map((row) => {
      const r = row as Record<string, any>;
      return { title: String(r.title || ''), locator: String(r.locator || ''),
        passage: String(r.passage || ''), url: String(r.url || '') };
    });
  }

  /** Minimal portable export view; no local paths, databases, chat contents or private docs by default. */
  exportClaims(statuses: ClaimStatus[] = ['verified'], options: { includePassages?: boolean } = {}): Array<Record<string, unknown>> {
    if (!statuses.length) return [];
    const allowed = new Set<ClaimStatus>(['candidate','verified','disputed','superseded','rejected']);
    if (statuses.some((s) => !allowed.has(s))) throw new Error('Invalid claim status filter');
    const placeholders = statuses.map(() => '?').join(',');
    const claims = this.sql(`SELECT * FROM atlas_claims WHERE status IN (${placeholders}) ORDER BY id`, statuses).rows ?? [];
    return (claims as any[]).map((c) => {
      const citations = this.sql(`SELECT e.citation_number,e.passage,e.locator,e.stance,
          s.id as source_id,s.kind,s.title,s.url,s.publication_date,s.retrieved_at,
          s.effective_from,s.effective_to,s.tax_year
          FROM atlas_evidence e JOIN atlas_sources s ON s.id = e.source_id
          WHERE e.claim_id = ? ORDER BY e.citation_number`, [c.id]).rows ?? [];
      return {
        format: 'atlas-knowledge-jsonl', schemaVersion: 1, recordType: 'claim',
        id: c.id, topic: c.topic, question: c.question, claim: c.claim_text,
        status: c.status, uncertainty: c.uncertainty, reportId: c.report_id,
        createdAt: c.created_at, updatedAt: c.updated_at,
        // Default export references evidence without reproducing potentially copyrighted passages.
        citations: (citations as any[]).map((e) => options.includePassages ? e : (({ passage: _passage, ...rest }) => rest)(e)),
      };
    });
  }
}

/** Lazy native loading, so importing learning utilities does not allocate a database. */
export const learningKnowledgeDb = new LearningKnowledgeDb(() =>
  require('@op-engineering/op-sqlite').open({ name: KNOWLEDGE_DB_NAME }));

/** Candidate sentence extraction. The original report remains separate and unchanged. */
export const extractCandidateClaims = claimSentences;
