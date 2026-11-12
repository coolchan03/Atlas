/** Portable, database-agnostic Atlas knowledge interchange v1 (JSONL).
 * Do not export raw private documents or copyrighted passages without consent.
 */
import type { ClaimStatus } from './evidenceGate';

const STATUSES: ClaimStatus[] = ['candidate', 'verified', 'disputed', 'superseded', 'rejected'];
export const KNOWLEDGE_FORMAT = 'atlas-knowledge-jsonl';
export const INTERCHANGE_SCHEMA_VERSION = 1;

export interface PortableClaim {
  format: typeof KNOWLEDGE_FORMAT;
  schemaVersion: 1;
  recordType: 'claim';
  id: string;
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

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateKnowledgeRecord(raw: unknown): PortableClaim {
  if (!isRecord(raw)) throw new Error('Knowledge record must be an object');
  if (raw.format !== KNOWLEDGE_FORMAT || raw.schemaVersion !== INTERCHANGE_SCHEMA_VERSION || raw.recordType !== 'claim') {
    throw new Error('Unsupported knowledge interchange schema or record type');
  }
  for (const field of ['id', 'topic', 'question', 'claim', 'reportId', 'createdAt', 'updatedAt']) {
    if (!nonempty(raw[field])) throw new Error(`Missing knowledge field ${field}`);
  }
  if (!STATUSES.includes(raw.status as ClaimStatus)) throw new Error('Invalid knowledge status');
  if (!Array.isArray(raw.citations) || raw.citations.some((v) => !isRecord(v))) throw new Error('Invalid citation array');
  // Do not infer verification from source count or model confidence.
  return raw as unknown as PortableClaim;
}

/** Deterministic export; safe to diff and version. */
export function toKnowledgeJsonl(records: PortableClaim[]): string {
  const seen = new Set<string>();
  const canonical: PortableClaim[] = [];
  for (const raw of records) {
    const row = validateKnowledgeRecord(raw);
    if (seen.has(row.id)) throw new Error(`Duplicate claim id in export: ${row.id}`);
    seen.add(row.id);
    canonical.push(row);
  }
  return canonical.sort((a, b) => a.id.localeCompare(b.id)).map((r) => JSON.stringify(r)).join('\n') + (canonical.length ? '\n' : '');
}

/** Reimport validates every row; identical duplicate IDs coalesce, conflicting copies fail closed. */
export function fromKnowledgeJsonl(input: string): PortableClaim[] {
  const out = new Map<string, PortableClaim>();
  const lines = input.split(/\r?\n/).filter((x) => x.trim().length > 0);
  if (lines.length > 100_000) throw new Error('Import is too large; use multiple files');
  for (const [index, line] of lines.entries()) {
    if (line.length > 1_000_000) throw new Error(`Oversized record on line ${index + 1}`);
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${index + 1}`); }
    const row = validateKnowledgeRecord(parsed);
    const existing = out.get(row.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(row)) {
      throw new Error(`Conflicting duplicate claim ${row.id}`);
    }
    out.set(row.id, row);
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
