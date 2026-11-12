import type { LearningKnowledgeDb } from './knowledgeDb';
import type { ClaimStatus } from './evidenceGate';
import { INTERCHANGE_SCHEMA_VERSION, KNOWLEDGE_FORMAT, validateKnowledgeRecord, type PortableClaim, type PortableRecord } from './knowledgeInterchange';

const head = <T extends string>(recordType: T, id: string) => ({ format: KNOWLEDGE_FORMAT, schemaVersion: INTERCHANGE_SCHEMA_VERSION, recordType, id }) as const;
const rows = (db: LearningKnowledgeDb, sql: string, params: Array<string | number | null> = []): any[] => db.sql(sql, params).rows ?? [];
const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface ExportOptions {
  /** Which claims to include. Default: only those a person verified. */
  statuses?: ClaimStatus[];
  /** Include the cited passages. Off by default: passages may be copyrighted or private. */
  includePassages?: boolean;
}

/**
 * Everything the learning system knows, as portable records: claims with their evidence, conflicts, correction history,
 * experience, procedures, exam results and learning progress. Exam questions are left out on purpose.
 */
export function exportLedger(db: LearningKnowledgeDb, options: ExportOptions = {}): PortableRecord[] {
  const claims = db.exportClaims(options.statuses ?? ['verified'], { includePassages: options.includePassages }) as unknown as PortableClaim[];
  const ids = new Set(claims.map((c) => c.id));
  const out: PortableRecord[] = [...claims];
  for (const r of rows(db, 'SELECT * FROM atlas_contradictions')) {
    if (ids.has(r.claim_a) && ids.has(r.claim_b)) out.push({ ...head('contradiction', r.id), claimA: r.claim_a, claimB: r.claim_b, reason: r.reason, detectedAt: r.detected_at, resolvedAt: text(r.resolved_at), resolution: text(r.resolution) });
  }
  for (const r of rows(db, 'SELECT * FROM atlas_claim_history')) {
    if (ids.has(r.claim_id)) out.push({ ...head('claim_history', `${r.claim_id}:${r.id}`), claimId: r.claim_id, oldStatus: r.old_status, newStatus: r.new_status, actor: r.actor, reason: r.reason, at: r.at });
  }
  for (const r of rows(db, 'SELECT * FROM atlas_experience')) {
    out.push({ ...head('experience', r.id), topic: r.topic, attempt: r.attempt, outcome: r.outcome, correction: text(r.correction), createdAt: r.created_at });
  }
  for (const r of rows(db, 'SELECT * FROM atlas_procedures')) {
    out.push({ ...head('procedure', r.id), topic: r.topic, method: r.method, status: r.verification_status, provenance: r.provenance, createdAt: r.created_at, updatedAt: r.updated_at });
  }
  for (const r of rows(db, 'SELECT * FROM atlas_exam_results')) {
    out.push({ ...head('exam_result', r.id), benchmarkVersion: r.benchmark_version, mode: r.mode, metrics: JSON.parse(String(r.metrics_json)), createdAt: r.created_at });
  }
  for (const r of rows(db, 'SELECT * FROM atlas_mastery')) {
    out.push({ ...head('mastery', r.concept_id), subjectId: r.subject_id, topic: r.topic, question: r.question, strength: Number(r.strength), streak: Number(r.streak), attempts: Number(r.attempts), lastAt: text(r.last_at), nextReview: r.next_review, lastOutcome: text(r.last_outcome) });
  }
  return out;
}

export interface ImportSummary { added: number; skipped: number }

/** Claims already in the ledger are skipped, so importing the same file twice changes nothing. */
function importClaim(db: LearningKnowledgeDb, c: PortableClaim): boolean {
  if (db.getClaim(c.id)) return false;
  // An import never grants "verified": that needs a review on this device. Restrictive statuses carry over.
  const status: ClaimStatus = c.status === 'verified' ? 'candidate' : c.status;
  const note = c.status === 'verified' ? `Imported as verified elsewhere; not reviewed on this device. ${c.uncertainty ?? ''}`.trim() : c.uncertainty ?? '';
  db.sql(`INSERT INTO atlas_claims (id, topic, question, claim_text, report_id, status, uncertainty, confidence, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.topic, c.question, c.claim, c.reportId, status, note || null, null, c.createdAt, c.updatedAt]);
  for (const cite of c.citations as Array<Record<string, any>>) {
    const sourceId = String(cite.source_id ?? `${c.reportId}:source:${cite.citation_number}`);
    db.sql(`INSERT OR IGNORE INTO atlas_sources (id,kind,title,url,source_type,authority,publication_date,retrieved_at,version_hash,effective_from,effective_to,tax_year)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [sourceId, String(cite.kind ?? 'imported'), String(cite.title ?? sourceId), text(cite.url), String(cite.kind ?? 'imported'), 'unassessed',
      text(cite.publication_date), String(cite.retrieved_at ?? c.createdAt), null, text(cite.effective_from), text(cite.effective_to), cite.tax_year ?? null]);
    db.sql('INSERT OR IGNORE INTO atlas_evidence (id,claim_id,source_id,citation_number,passage,locator,stance,retrieved_at) VALUES (?,?,?,?,?,?,?,?)',
      [`${c.id}:source:${cite.citation_number}`, c.id, sourceId, Number(cite.citation_number) || 0, text(cite.passage), text(cite.locator), String(cite.stance ?? 'cited'), String(cite.retrieved_at ?? c.createdAt)]);
  }
  return true;
}

const exists = (db: LearningKnowledgeDb, where: { table: string; column: string; id: string }) =>
  rows(db, `SELECT 1 AS x FROM ${where.table} WHERE ${where.column} = ?`, [where.id]).length > 0;

type Importer<T extends PortableRecord> = (db: LearningKnowledgeDb, r: T) => boolean;
type ByType = { [K in PortableRecord['recordType']]?: Importer<Extract<PortableRecord, { recordType: K }>> };

/** One writer per record type, each ignoring an id that is already there and returning whether a row was added. */
const IMPORTERS: ByType = {
  contradiction: (db, r) => {
    if (exists(db, { table: 'atlas_contradictions', column: 'id', id: r.id }) || !db.getClaim(r.claimA) || !db.getClaim(r.claimB)) return false;
    db.sql('INSERT INTO atlas_contradictions (id,claim_a,claim_b,reason,detected_at,resolved_at,resolution) VALUES (?,?,?,?,?,?,?)', [r.id, r.claimA, r.claimB, r.reason, r.detectedAt, r.resolvedAt ?? null, r.resolution ?? null]);
    return true;
  },
  claim_history: (db, r) => {
    if (!db.getClaim(r.claimId) || exists(db, { table: 'atlas_claim_history', column: 'reason || at || claim_id', id: `${r.reason}${r.at}${r.claimId}` })) return false;
    db.sql('INSERT INTO atlas_claim_history (claim_id,old_status,new_status,actor,reason,at) VALUES (?,?,?,?,?,?)', [r.claimId, r.oldStatus, r.newStatus, r.actor, r.reason, r.at]);
    return true;
  },
  experience: (db, r) => {
    if (exists(db, { table: 'atlas_experience', column: 'id', id: r.id })) return false;
    db.sql('INSERT INTO atlas_experience (id,topic,attempt,outcome,correction,created_at) VALUES (?,?,?,?,?,?)', [r.id, r.topic, r.attempt, r.outcome, r.correction ?? null, r.createdAt]);
    return true;
  },
  procedure: (db, r) => {
    if (exists(db, { table: 'atlas_procedures', column: 'id', id: r.id })) return false;
    // An imported strategy is as unverified as a suggested one.
    const provenance = r.provenance.startsWith('imported:') ? r.provenance : `imported: ${r.provenance}`;
    db.sql('INSERT INTO atlas_procedures (id,topic,method,verification_status,provenance,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [r.id, r.topic, r.method, 'unverified', provenance, r.createdAt, r.updatedAt]);
    return true;
  },
  exam_result: (db, r) => {
    if (exists(db, { table: 'atlas_exam_results', column: 'id', id: r.id })) return false;
    db.sql('INSERT INTO atlas_exam_results (id,benchmark_version,mode,metrics_json,created_at) VALUES (?,?,?,?,?)', [r.id, r.benchmarkVersion, r.mode, JSON.stringify(r.metrics), r.createdAt]);
    return true;
  },
  mastery: (db, r) => {
    if (exists(db, { table: 'atlas_mastery', column: 'concept_id', id: r.id })) return false;
    db.sql('INSERT INTO atlas_mastery (concept_id,subject_id,topic,question,strength,streak,attempts,last_at,next_review,last_outcome) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [r.id, r.subjectId, r.topic, r.question, r.strength, r.streak, r.attempts, r.lastAt ?? null, r.nextReview, r.lastOutcome ?? null]);
    return true;
  },
};

/** Imports validated records inside one transaction: a bad record changes nothing. Claims first, so the rest can refer to them. */
export function importLedger(db: LearningKnowledgeDb, records: unknown[]): ImportSummary {
  const valid = records.map(validateKnowledgeRecord);
  const claimsFirst = [...valid.filter((r) => r.recordType === 'claim'), ...valid.filter((r) => r.recordType !== 'claim')];
  const summary: ImportSummary = { added: 0, skipped: 0 };
  db.sql('BEGIN');
  try {
    for (const r of claimsFirst) {
      const write = r.recordType === 'claim' ? importClaim : (IMPORTERS[r.recordType] as Importer<PortableRecord> | undefined);
      const added = write ? write(db, r as never) : false;
      if (added) summary.added += 1; else summary.skipped += 1;
    }
    db.sql('COMMIT');
  } catch (error) { db.sql('ROLLBACK'); throw error; }
  return summary;
}
