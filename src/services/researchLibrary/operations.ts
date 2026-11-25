import type { Evidence, LibraryDocument, LibraryManifest, LibraryPassage, LibraryLink, SearchScope } from './types';
import type { LibraryQueries } from './db';
import type { LibraryProfile } from './profile';

/** An opened library: its queries, its subject profile and a way to read original text by byte range. */
export interface LibraryContext {
  id: string;
  manifest: LibraryManifest;
  queries: LibraryQueries;
  profile: LibraryProfile;
  /** The text between two byte offsets of a source file (relative to the library's sources folder). */
  readSource(path: string, byteStart: number, byteEnd: number): Promise<string>;
}

/** The most characters of original text one call returns. A long document is read in parts with a cursor. */
export const MAX_READ_CHARS = 6000;
const MAX_PASSAGE_CHARS = 1800;

async function textOf(ctx: LibraryContext, part: { doc: LibraryDocument; p: LibraryPassage; max?: number }): Promise<string> {
  const { doc, p, max = MAX_PASSAGE_CHARS } = part;
  let text = p.text;
  if (text === undefined && doc.sourcePath && p.byteStart !== undefined && p.byteEnd !== undefined && p.byteEnd > p.byteStart) {
    // A passage can be long: read at most what will be shown (4 bytes per character covers any UTF-8 text).
    text = await ctx.readSource(doc.sourcePath, p.byteStart, Math.min(p.byteEnd, p.byteStart + max * 4));
  }
  return (text ?? '').replace(/\s+\n/g, '\n').trim().slice(0, max);
}

/** A passage with everything needed to cite it. `statusVerified` is true only when the library itself says so. */
export async function toEvidence(ctx: LibraryContext, hit: { doc: LibraryDocument; p: LibraryPassage; period?: number; score?: number }): Promise<Evidence> {
  const { doc, p, period, score } = hit;
  const ap = ctx.profile.applicability(doc, period);
  return {
    libraryId: ctx.id, documentId: doc.id, reference: doc.reference, title: doc.title, locator: p.locator, text: await textOf(ctx, { doc, p }),
    kind: doc.kind, facets: doc.facets, published: doc.published, effectiveFrom: doc.effectiveFrom, effectiveTo: doc.effectiveTo, edition: doc.edition,
    sourcePath: doc.sourcePath, sourceUrl: doc.sourceUrl, checksum: doc.checksum, applies: ap.applies, appliesWhy: ap.why,
    statusVerified: /^verified\b/i.test(doc.status ?? ''), status: doc.status, quality: doc.quality, score,
  };
}

/**
 * Topic search. Results are the best passages of the library; when a period is asked about, documents that do not apply to it are
 * dropped (and ones whose applicability is unknown are kept but marked), so the model is not handed another year's rule as if it applied.
 */
export async function searchLibrary(ctx: LibraryContext, query: string, scope: SearchScope = {}): Promise<Evidence[]> {
  const limit = Math.min(Math.max(scope.limit ?? 8, 1), 20);
  const hits = await ctx.queries.searchPassages(query, { filters: scope.filters, limit: limit * 4 });
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const h of hits) {
    const key = `${h.document.id}|${h.passage.locator ?? h.passage.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const e = await toEvidence(ctx, { doc: h.document, p: h.passage, period: scope.period, score: h.score });
    if (scope.period !== undefined && e.applies === 'no') continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export interface ReferenceResult { documents: LibraryDocument[]; locator?: string; passages: Evidence[]; neighbours: LibraryDocument[] }

/** A typed reference ("IRC 162(a)(1)") to the document and the asked-for part, through the library's profile. */
export async function findReference(ctx: LibraryContext, reference: string, scope: SearchScope = {}): Promise<ReferenceResult> {
  const keys = ctx.profile.referenceKeys(reference);
  let documents = await ctx.queries.documentsByReference(keys.exact);
  let neighbours: LibraryDocument[] = [];
  if (!documents.length && keys.prefix) { neighbours = await ctx.queries.documentsByPrefix(keys.prefix, 10); documents = neighbours.slice(0, 1); }
  else if (keys.prefix) neighbours = (await ctx.queries.documentsByPrefix(keys.prefix, 10)).filter((d) => !documents.some((x) => x.id === d.id));
  const passages: Evidence[] = [];
  for (const d of documents.slice(0, 3)) {
    for (const p of await ctx.queries.passagesOf(d.id, { locatorPrefix: keys.locator, limit: 6 })) passages.push(await toEvidence(ctx, { doc: d, p, period: scope.period }));
  }
  return { documents, locator: keys.locator, passages, neighbours };
}

export interface ReadResult { document: LibraryDocument; text: string; locator?: string; /** Pass back to continue; absent at the end. */ cursor?: number; truncated: boolean }

/** Original text of a document, in bounded parts. `cursor` is the id of the last passage already read. */
export async function readDocument(ctx: LibraryContext, documentId: string, opts: { locator?: string; cursor?: number; maxChars?: number } = {}): Promise<ReadResult | null> {
  const [doc] = await ctx.queries.documentsById([documentId]);
  if (!doc) return null;
  const budget = Math.min(opts.maxChars ?? MAX_READ_CHARS, MAX_READ_CHARS);
  const passages = await ctx.queries.passagesOf(doc.id, { locatorPrefix: opts.locator, after: opts.cursor, limit: 60 });
  let text = ''; let cursor: number | undefined; let truncated = false;
  for (const p of passages) {
    const part = await textOf(ctx, { doc, p, max: budget });
    const label = p.locator ? `${p.locator} ` : '';
    if (text.length + part.length + label.length > budget && text) { truncated = true; break; }
    text += `${label}${part}\n\n`;
    cursor = Number(p.id);
    if (text.length >= budget) { truncated = true; break; }
  }
  return { document: doc, text: text.trim(), locator: opts.locator, cursor: truncated || passages.length === 60 ? cursor : undefined, truncated };
}

export interface VersionResult { versions: Array<{ documentId: string; edition?: string; effectiveFrom?: string; effectiveTo?: string; reference?: string; applies: 'yes' | 'no' | 'unknown'; why: string }> }

/** Every version of a document the library holds, with which one applies to the period asked about. */
export async function documentVersions(ctx: LibraryContext, documentId: string, period?: number): Promise<VersionResult> {
  const versions = await ctx.queries.versionsOf(documentId);
  const docs = await ctx.queries.documentsById([...new Set([documentId, ...versions.map((v) => v.documentId)])]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    versions: versions.map((v) => {
      const d = byId.get(v.documentId);
      const ap = ctx.profile.applicability({ ...(d ?? { id: v.documentId, reference: '', title: '', facets: {} }), effectiveFrom: v.effectiveFrom ?? d?.effectiveFrom, effectiveTo: v.effectiveTo ?? d?.effectiveTo }, period);
      return { documentId: v.documentId, edition: v.edition ?? d?.edition, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, reference: d?.reference, applies: ap.applies, why: ap.why };
    }),
  };
}

export interface RelatedResult { related: Array<{ link: LibraryLink; document?: LibraryDocument; direction: 'from' | 'to' }> }
export async function relatedDocuments(ctx: LibraryContext, documentId: string, kinds?: string[]): Promise<RelatedResult> {
  const links = (await ctx.queries.linksOf(documentId)).filter((l) => !kinds?.length || kinds.includes(l.kind));
  const others = links.map((l) => (l.fromId === documentId ? l.toId : l.fromId));
  const docs = await ctx.queries.documentsById([...new Set(others)]);
  return { related: links.map((l) => ({ link: l, direction: l.fromId === documentId ? 'from' : 'to', document: docs.find((d) => d.id === (l.fromId === documentId ? l.toId : l.fromId)) })) };
}

/** Link kinds that mean a document has been changed or set aside by a later one. */
const LATER_TREATMENT = /amend|supersed|overrul|revers|vacat|repeal|obsolet|modif|distinguish|limited|abrogat|withdraw|clarif/i;

export interface StatusResult {
  document?: LibraryDocument;
  /** What the library records as the document's status, as written. */
  recordedStatus?: string;
  /** True only if the library itself marks the status as verified. */
  verified: boolean;
  /** Later documents that changed or questioned it, as the library links them. */
  laterTreatment: Array<{ kind: string; reference?: string; note?: string }>;
  statement: string;
}

/**
 * What the library can say about whether a document still stands. It reports recorded status and linked later treatment and says so
 * plainly when the status is not verified; a missing link is never read as "still good".
 */
export async function documentStatus(ctx: LibraryContext, documentId: string): Promise<StatusResult> {
  const [doc] = await ctx.queries.documentsById([documentId]);
  if (!doc) return { verified: false, laterTreatment: [], statement: 'This document is not in the library.' };
  const rel = await relatedDocuments(ctx, documentId);
  const later = rel.related.filter((r) => r.direction === 'to' && LATER_TREATMENT.test(r.link.kind));
  const verified = /^verified\b/i.test(doc.status ?? '');
  const laterTreatment = later.map((r) => ({ kind: r.link.kind, reference: r.document?.reference, note: r.link.note }));
  let statement: string;
  if (laterTreatment.length) statement = `The library links ${laterTreatment.length} later document(s) that changed or questioned this one. Read them before relying on it.`;
  else if (verified) statement = 'The library records this status as verified, and links no later treatment.';
  else statement = 'No later treatment is linked in this library, but its current status was NOT verified. Say so, and check an official source before relying on it.';
  return { document: doc, recordedStatus: doc.status, verified, laterTreatment, statement };
}
