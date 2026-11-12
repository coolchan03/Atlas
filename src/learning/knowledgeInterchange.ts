/**
 * Portable, database-agnostic Atlas knowledge interchange v1 (JSONL), one record per line.
 * Do not export raw private documents or copyrighted passages without consent.
 *
 * Record types: claim (with its citations), contradiction, claim_history, experience, procedure, exam_result and mastery.
 * Exam questions are never exported, so an exam cannot leak into another system's training data.
 */
import type { ClaimStatus } from './evidenceGate';

const STATUSES: ClaimStatus[] = ['candidate', 'verified', 'disputed', 'superseded', 'rejected'];
export const KNOWLEDGE_FORMAT = 'atlas-knowledge-jsonl';
export const INTERCHANGE_SCHEMA_VERSION = 1;

interface Header { format: typeof KNOWLEDGE_FORMAT; schemaVersion: 1; id: string }

export interface PortableClaim extends Header {
  recordType: 'claim';
  topic: string;
  question: string;
  claim: string;
  status: ClaimStatus;
  reportId: string;
  createdAt: string;
  updatedAt: string;
  uncertainty?: string | null;
  citations: Array<Record<string, unknown>>;
}
export interface PortableContradiction extends Header {
  recordType: 'contradiction'; claimA: string; claimB: string; reason: string; detectedAt: string; resolvedAt?: string | null; resolution?: string | null;
}
export interface PortableHistory extends Header {
  recordType: 'claim_history'; claimId: string; oldStatus: ClaimStatus; newStatus: ClaimStatus; actor: string; reason: string; at: string;
}
export interface PortableExperience extends Header {
  recordType: 'experience'; topic: string; attempt: string; outcome: string; correction?: string | null; createdAt: string;
}
export interface PortableProcedure extends Header {
  recordType: 'procedure'; topic: string; method: string; status: string; provenance: string; createdAt: string; updatedAt: string;
}
export interface PortableExamResult extends Header {
  recordType: 'exam_result'; benchmarkVersion: string; mode: string; metrics: Record<string, unknown>; createdAt: string;
}
export interface PortableMastery extends Header {
  recordType: 'mastery'; subjectId: string; topic: string; question: string; strength: number; streak: number; attempts: number;
  lastAt?: string | null; nextReview: string; lastOutcome?: string | null;
}
export type PortableRecord = PortableClaim | PortableContradiction | PortableHistory | PortableExperience | PortableProcedure | PortableExamResult | PortableMastery;

/** The text fields every record type must have, so a malformed or half-empty line is refused rather than guessed at. */
const REQUIRED: Record<PortableRecord['recordType'], string[]> = {
  claim: ['id', 'topic', 'question', 'claim', 'reportId', 'createdAt', 'updatedAt'],
  contradiction: ['id', 'claimA', 'claimB', 'reason', 'detectedAt'],
  claim_history: ['id', 'claimId', 'actor', 'reason', 'at'],
  experience: ['id', 'topic', 'attempt', 'outcome', 'createdAt'],
  procedure: ['id', 'topic', 'method', 'status', 'provenance', 'createdAt', 'updatedAt'],
  exam_result: ['id', 'benchmarkVersion', 'mode', 'createdAt'],
  mastery: ['id', 'subjectId', 'topic', 'question', 'nextReview'],
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateKnowledgeRecord(raw: unknown): PortableRecord {
  if (!isRecord(raw)) throw new Error('Knowledge record must be an object');
  const type = raw.recordType as PortableRecord['recordType'];
  if (raw.format !== KNOWLEDGE_FORMAT || raw.schemaVersion !== INTERCHANGE_SCHEMA_VERSION || !(type in REQUIRED)) {
    throw new Error('Unsupported knowledge interchange schema or record type');
  }
  for (const field of REQUIRED[type]) if (!nonempty(raw[field])) throw new Error(`Missing knowledge field ${field}`);
  if (type === 'claim') {
    if (!STATUSES.includes(raw.status as ClaimStatus)) throw new Error('Invalid knowledge status');
    if (!Array.isArray(raw.citations) || raw.citations.some((v) => !isRecord(v))) throw new Error('Invalid citation array');
  }
  if (type === 'claim_history' && (!STATUSES.includes(raw.oldStatus as ClaimStatus) || !STATUSES.includes(raw.newStatus as ClaimStatus))) throw new Error('Invalid knowledge status');
  if (type === 'exam_result' && !isRecord(raw.metrics)) throw new Error('Exam result has no metrics');
  if (type === 'mastery' && !['strength', 'streak', 'attempts'].every((f) => typeof raw[f] === 'number' && Number.isFinite(raw[f]))) throw new Error('Mastery record has an invalid number');
  // Do not infer verification from source count or model confidence.
  return raw as unknown as PortableRecord;
}

const key = (r: PortableRecord) => `${r.recordType}:${r.id}`;
const order = (a: PortableRecord, b: PortableRecord) => key(a).localeCompare(key(b));

/** Deterministic export; safe to diff and version. */
export function toKnowledgeJsonl(records: PortableRecord[]): string {
  const seen = new Set<string>();
  const canonical: PortableRecord[] = [];
  for (const raw of records) {
    const row = validateKnowledgeRecord(raw);
    if (seen.has(key(row))) throw new Error(`Duplicate ${row.recordType} id in export: ${row.id}`);
    seen.add(key(row));
    canonical.push(row);
  }
  return canonical.sort(order).map((r) => JSON.stringify(r)).join('\n') + (canonical.length ? '\n' : '');
}

/** Reimport validates every row; identical duplicate records coalesce, conflicting copies fail closed. */
export function fromKnowledgeJsonl(input: string): PortableRecord[] {
  const out = new Map<string, PortableRecord>();
  const lines = input.split(/\r?\n/).filter((x) => x.trim().length > 0);
  if (lines.length > 100_000) throw new Error('Import is too large; use multiple files');
  for (const [index, line] of lines.entries()) {
    if (line.length > 1_000_000) throw new Error(`Oversized record on line ${index + 1}`);
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${index + 1}`); }
    const row = validateKnowledgeRecord(parsed);
    const existing = out.get(key(row));
    if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error(`Conflicting duplicate ${row.recordType} ${row.id}`);
    out.set(key(row), row);
  }
  return [...out.values()].sort(order);
}
