import type { LibraryDocument, LibraryLink, LibraryManifest, LibraryPassage, LibraryVersion } from './types';
import { ftsMatchQuery } from '../rag/ftsQuery';

/** The only thing the library code needs from SQLite: run a read query. The app backs it with op-sqlite; tests use a real in-memory engine. */
export interface LibraryDb { all(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

type Fields = Record<string, string>;
/** The columns a library is expected to have, by the app's field name. A manifest renames any of them. */
export const DEFAULT_COLUMNS = {
  documents: { id: 'id', reference: 'reference', title: 'title', kind: 'kind', published: 'published', effectiveFrom: 'effective_from', effectiveTo: 'effective_to', periodFrom: 'period_from', periodTo: 'period_to', edition: 'edition', sourcePath: 'source_path', sourceUrl: 'source_url', checksum: 'checksum', status: 'status', quality: 'quality' },
  passages: { id: 'id', documentId: 'document_id', locator: 'locator', byteStart: 'byte_start', byteEnd: 'byte_end', text: 'text' },
  links: { fromId: 'from_id', toId: 'to_id', kind: 'kind', note: 'note' },
  versions: { family: 'family', documentId: 'document_id', edition: 'edition', effectiveFrom: 'effective_from', effectiveTo: 'effective_to' },
} as const;
const DEFAULT_TABLES = { documents: 'documents', passages: 'passages', links: 'links', versions: 'versions' } as const;
type TableName = keyof typeof DEFAULT_TABLES;

const num = (v: unknown): number | undefined => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? undefined : n; };
const str = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v));

/** Reads one library through its manifest's table and column names. Names come from the (validated) manifest, values are always bound parameters. */
export class LibraryQueries {
  constructor(private db: LibraryDb, private manifest: LibraryManifest) {}

  private table(name: TableName): string { return this.manifest.tables?.[name]?.table ?? DEFAULT_TABLES[name]; }
  private col(name: TableName, field: string): string {
    return this.manifest.tables?.[name]?.columns?.[field] ?? (DEFAULT_COLUMNS[name] as Fields)[field];
  }
  /** `SELECT col AS field, ...` for every field of a table, so rows come back under the app's names whatever the library calls them. */
  private select(name: TableName, alias: string, prefix = ''): string {
    return Object.keys(DEFAULT_COLUMNS[name]).map((f) => `${alias}.${this.col(name, f)} AS ${prefix}${f}`).join(', ');
  }
  private facetSelect(alias: string): string {
    return (this.manifest.facets ?? []).map((f) => `, ${alias}.${f.column} AS facet_${f.key}`).join('');
  }
  private toDocument(r: Record<string, unknown>): LibraryDocument {
    const facets: Record<string, string> = {};
    for (const f of this.manifest.facets ?? []) { const v = str(r[`facet_${f.key}`]); if (v !== undefined) facets[f.key] = v; }
    return {
      id: String(r.id), reference: String(r.reference ?? ''), title: String(r.title ?? ''), kind: str(r.kind), published: str(r.published),
      effectiveFrom: str(r.effectiveFrom), effectiveTo: str(r.effectiveTo), periodFrom: num(r.periodFrom), periodTo: num(r.periodTo), edition: str(r.edition),
      sourcePath: str(r.sourcePath), sourceUrl: str(r.sourceUrl), checksum: str(r.checksum), status: str(r.status), quality: str(r.quality), facets,
    };
  }
  private toPassage(r: Record<string, unknown>): LibraryPassage {
    return { id: String(r.id), documentId: String(r.documentId), locator: str(r.locator), byteStart: num(r.byteStart), byteEnd: num(r.byteEnd), text: str(r.text) };
  }

  /** Optional facet filters as SQL: only facets the manifest declares are accepted, so a model cannot name a column. */
  private filterSql(alias: string, filters: Record<string, string> = {}): { sql: string; params: string[] } {
    const parts: string[] = []; const params: string[] = [];
    for (const [key, value] of Object.entries(filters)) {
      const facet = (this.manifest.facets ?? []).find((f) => f.key === key);
      if (!facet || !String(value).trim()) continue;
      parts.push(`${alias}.${facet.column} = ?`); params.push(String(value));
    }
    return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
  }

  /** Full-text search over passages, best first. */
  async searchPassages(query: string, opts: { filters?: Record<string, string>; limit?: number } = {}): Promise<Array<{ passage: LibraryPassage; document: LibraryDocument; score: number }>> {
    const match = ftsMatchQuery(query);
    if (!match) return [];
    const fts = this.manifest.ftsTable ?? 'passages_fts';
    const f = this.filterSql('d', opts.filters);
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const sql = `SELECT ${this.select('passages', 'p', 'p_')}, ${this.select('documents', 'd')}${this.facetSelect('d')}, bm25(${fts}) AS score
      FROM ${fts} JOIN ${this.table('passages')} p ON p.${this.col('passages', 'id')} = ${fts}.rowid
      JOIN ${this.table('documents')} d ON d.${this.col('documents', 'id')} = p.${this.col('passages', 'documentId')}
      WHERE ${fts} MATCH ?${f.sql} ORDER BY score LIMIT ${limit}`;
    const rows = await this.db.all(sql, [match, ...f.params]);
    return rows.map((r) => ({
      passage: this.toPassage({ id: r.p_id, documentId: r.p_documentId, locator: r.p_locator, byteStart: r.p_byteStart, byteEnd: r.p_byteEnd, text: r.p_text }),
      document: this.toDocument(r),
      score: Number(r.score),
    }));
  }

  async documentsById(ids: string[]): Promise<LibraryDocument[]> {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    const rows = await this.db.all(`SELECT ${this.select('documents', 'd')}${this.facetSelect('d')} FROM ${this.table('documents')} d WHERE d.${this.col('documents', 'id')} IN (${marks})`, ids);
    return rows.map((r) => this.toDocument(r));
  }

  /** Documents whose reference matches any of the keys, written the library's way or in a normalised form. */
  async documentsByReference(variants: string[], limit = 20): Promise<LibraryDocument[]> {
    if (!variants.length) return [];
    const ref = `d.${this.col('documents', 'reference')}`;
    const clause = variants.map(() => `lower(${ref}) = lower(?)`).join(' OR ');
    const rows = await this.db.all(`SELECT ${this.select('documents', 'd')}${this.facetSelect('d')} FROM ${this.table('documents')} d WHERE ${clause} LIMIT ${limit}`, variants);
    return rows.map((r) => this.toDocument(r));
  }
  /** Documents whose reference starts with a prefix (a section and its subsections). */
  async documentsByPrefix(prefix: string, limit = 20): Promise<LibraryDocument[]> {
    const ref = `d.${this.col('documents', 'reference')}`;
    const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await this.db.all(`SELECT ${this.select('documents', 'd')}${this.facetSelect('d')} FROM ${this.table('documents')} d WHERE lower(${ref}) LIKE lower(?) ESCAPE '\\' ORDER BY ${ref} LIMIT ${limit}`, [`${escaped}%`]);
    return rows.map((r) => this.toDocument(r));
  }

  async passagesOf(documentId: string, opts: { locatorPrefix?: string; after?: number; limit?: number } = {}): Promise<LibraryPassage[]> {
    const id = this.col('passages', 'id');
    const loc = this.col('passages', 'locator');
    const where = [`p.${this.col('passages', 'documentId')} = ?`, `p.${id} > ?`];
    const params: unknown[] = [documentId, opts.after ?? 0];
    if (opts.locatorPrefix) { where.push(`lower(p.${loc}) LIKE lower(?)`); params.push(`${opts.locatorPrefix}%`); }
    const rows = await this.db.all(`SELECT ${this.select('passages', 'p')} FROM ${this.table('passages')} p WHERE ${where.join(' AND ')} ORDER BY p.${id} LIMIT ${Math.min(opts.limit ?? 40, 200)}`, params);
    return rows.map((r) => this.toPassage(r));
  }

  async linksOf(documentId: string, limit = 40): Promise<LibraryLink[]> {
    const from = this.col('links', 'fromId'); const to = this.col('links', 'toId');
    const rows = await this.db.all(`SELECT ${this.select('links', 'l')} FROM ${this.table('links')} l WHERE l.${from} = ? OR l.${to} = ? LIMIT ${limit}`, [documentId, documentId]);
    return rows.map((r) => ({ fromId: String(r.fromId), toId: String(r.toId), kind: String(r.kind ?? 'related'), note: str(r.note) }));
  }

  async versionsOf(documentId: string): Promise<LibraryVersion[]> {
    const fam = this.col('versions', 'family'); const doc = this.col('versions', 'documentId');
    const rows = await this.db.all(`SELECT ${this.select('versions', 'v')} FROM ${this.table('versions')} v WHERE v.${fam} IN (SELECT ${fam} FROM ${this.table('versions')} WHERE ${doc} = ?) ORDER BY v.${this.col('versions', 'effectiveFrom')}`, [documentId]);
    return rows.map((r) => ({ family: String(r.family), documentId: String(r.documentId), edition: str(r.edition), effectiveFrom: str(r.effectiveFrom), effectiveTo: str(r.effectiveTo) }));
  }

  /** Cheap check that the database is the shape the manifest says (the tables and the full-text index exist). Names of what is missing. */
  async missingParts(): Promise<string[]> {
    const rows = await this.db.all(`SELECT name FROM sqlite_master WHERE type IN ('table','view')`);
    const have = new Set(rows.map((r) => String(r.name)));
    const need = [this.table('documents'), this.table('passages'), this.manifest.ftsTable ?? 'passages_fts'];
    return need.filter((n) => !have.has(n));
  }
}
