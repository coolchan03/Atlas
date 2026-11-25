import { librariesForProject } from './installed';
import { documentStatus, documentVersions, findReference, readDocument, relatedDocuments, searchLibrary, type LibraryContext } from './operations';
import { formatEvidence } from './context';
import type { Evidence, LibraryDocument, SearchScope } from './types';
import { useProjectStore } from '../../stores/projectStore';

/** The tool names, so the chat can tell when a project's turn should carry them. */
export const LIBRARY_TOOL_IDS = ['library_search', 'library_find_reference', 'library_read', 'library_versions', 'library_related', 'library_status'] as const;

const NONE = 'This project has no research library attached. Add one in the project\'s Knowledge Base.';
type Args = Record<string, any>;
type Handler = (ctxs: LibraryContext[], args: Args) => Promise<string>;

function contextsFor(projectId?: string): LibraryContext[] {
  const ids = projectId ? useProjectStore.getState().getProject(projectId)?.researchLibraryIds : undefined;
  return librariesForProject(ids);
}
/** "lib:doc" -> its library and the document id; with one library attached a bare id works. */
function resolveDoc(ctxs: LibraryContext[], args: Args): { ctx: LibraryContext; docId: string } {
  const id = String(args.document_id ?? '');
  const i = id.indexOf(':');
  const named = i > 0 ? ctxs.find((c) => c.id === id.slice(0, i)) : undefined;
  if (named) return { ctx: named, docId: id.slice(i + 1) };
  if (ctxs.length === 1 && id) return { ctx: ctxs[0], docId: id };
  throw new Error('Unknown document_id. Use the id shown by library_search or library_find_reference.');
}
const optionalNumber = (v: unknown): number | undefined => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
function scopeOf(args: Args): SearchScope {
  const filters: Record<string, string> = {};
  for (const pair of String(args.filters ?? '').split(',')) { const [k, ...v] = pair.split('='); if (k?.trim() && v.length) filters[k.trim()] = v.join('=').trim(); }
  return { period: optionalNumber(args.period), filters, limit: Math.min(Number(args.limit) || 8, 15) };
}
const idOf = (c: LibraryContext, d: { id: string }): string => `${c.id}:${d.id}`;
const evidenceList = (items: Array<{ ctxId: string; e: Evidence }>): string =>
  items.map(({ ctxId, e }, i) => `${formatEvidence([e]).replace(/^\[1\]/, `[${i + 1}]`)}\nid: ${ctxId}:${e.documentId}`).join('\n\n');
const describe = (d: LibraryDocument): string => [d.kind, d.edition && `edition ${d.edition}`, d.published && `published ${d.published}`].filter(Boolean).join(', ');
const appliesText = (a: 'yes' | 'no' | 'unknown'): string => ({ yes: 'applies', no: 'does not apply', unknown: 'applicability not stated' })[a];

const search: Handler = async (ctxs, args) => {
  const q = String(args.query ?? '').trim();
  if (!q) throw new Error('Missing required parameter: query');
  const found = (await Promise.all(ctxs.map(async (c) => (await searchLibrary(c, q, scopeOf(args))).map((e) => ({ ctxId: c.id, e }))))).flat()
    .sort((a, b) => (a.e.score ?? 0) - (b.e.score ?? 0)).slice(0, 8);
  return found.length ? evidenceList(found) : `Nothing in the attached libraries matches "${q}". Try other words, a reference, or no period.`;
};
const reference: Handler = async (ctxs, args) => {
  const ref = String(args.reference ?? '').trim();
  if (!ref) throw new Error('Missing required parameter: reference');
  const lines: string[] = [];
  for (const c of ctxs) {
    const r = await findReference(c, ref, scopeOf(args));
    for (const d of r.documents) lines.push(`${d.reference} - ${d.title} (${describe(d)}) id: ${idOf(c, d)}`);
    if (r.passages.length) lines.push('', evidenceList(r.passages.map((e) => ({ ctxId: c.id, e }))));
    if (!r.documents.length && r.neighbours.length) lines.push(`Nearby references: ${r.neighbours.map((d) => d.reference).join('; ')}`);
  }
  return lines.length ? lines.join('\n') : `No document with the reference "${ref}" was found. It may be written differently in the library: use library_search.`;
};
const read: Handler = async (ctxs, args) => {
  const t = resolveDoc(ctxs, args);
  const r = await readDocument(t.ctx, t.docId, { locator: args.part ? String(args.part) : undefined, cursor: optionalNumber(args.cursor) });
  if (!r) return 'That document is not in the library.';
  const tail = r.cursor === undefined ? '[end]' : `[more: call library_read again with cursor=${r.cursor}]`;
  return `${r.document.reference} - ${r.document.title}\n\n${r.text}\n\n${tail}`;
};
const versions: Handler = async (ctxs, args) => {
  const t = resolveDoc(ctxs, args);
  const v = await documentVersions(t.ctx, t.docId, optionalNumber(args.period));
  if (!v.versions.length) return 'The library records no other versions of this document.';
  return v.versions.map((x) => `${x.reference ?? x.documentId} edition ${x.edition ?? '?'} (${x.effectiveFrom ?? '?'} to ${x.effectiveTo ?? 'now'}): ${appliesText(x.applies)} - ${x.why}; id: ${t.ctx.id}:${x.documentId}`).join('\n');
};
const related: Handler = async (ctxs, args) => {
  const t = resolveDoc(ctxs, args);
  const kinds = String(args.kinds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const r = await relatedDocuments(t.ctx, t.docId, kinds);
  if (!r.related.length) return 'No linked documents are recorded.';
  return r.related.map((x) => {
    const other = x.document?.reference ?? '?';
    const sentence = x.direction === 'from' ? `this document ${x.link.kind} ${other}` : `${other} ${x.link.kind} this document`;
    return `${sentence}${x.link.note ? ` (${x.link.note})` : ''}${x.document ? `; id: ${idOf(t.ctx, x.document)}` : ''}`;
  }).join('\n');
};
const status: Handler = async (ctxs, args) => {
  const t = resolveDoc(ctxs, args);
  const s = await documentStatus(t.ctx, t.docId);
  const later = s.laterTreatment.map((l) => `Later: ${l.kind} ${l.reference ?? ''}${l.note ? ` (${l.note})` : ''}`);
  return [s.statement, s.recordedStatus ? `Recorded status: ${s.recordedStatus}` : '', ...later].filter(Boolean).join('\n');
};

const HANDLERS: Record<string, Handler> = { library_search: search, library_find_reference: reference, library_read: read, library_versions: versions, library_related: related, library_status: status };

export async function runLibraryTool(name: string, args: Args, projectId?: string): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown library tool: ${name}`);
  const ctxs = contextsFor(projectId);
  return ctxs.length ? handler(ctxs, args) : NONE;
}
