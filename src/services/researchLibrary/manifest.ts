import { LibraryManifest, MANIFEST_SCHEMA } from './types';

const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REL = (p: unknown): p is string => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..');

function tableProblems(tables: NonNullable<LibraryManifest['tables']>): string[] {
  const out: string[] = [];
  for (const [name, map] of Object.entries(tables)) {
    if (map?.table !== undefined && !IDENT.test(map.table)) out.push(`tables.${name}.table must be a plain identifier`);
    for (const [field, col] of Object.entries(map?.columns ?? {})) if (!IDENT.test(String(col))) out.push(`tables.${name}.columns.${field} must be a plain identifier`);
  }
  return out;
}
function facetProblems(facets: NonNullable<LibraryManifest['facets']>): string[] {
  return facets.flatMap((f) => {
    if (!f || !/^[a-z][a-z0-9_]{0,30}$/.test(String(f.key))) return ['every facet needs a short lowercase key'];
    return IDENT.test(String(f.column)) ? [] : [`facet ${f.key}: column must be a plain identifier`];
  });
}
function basicProblems(m: Partial<LibraryManifest>): string[] {
  const out: string[] = [];
  if (m.schema !== MANIFEST_SCHEMA) out.push(`schema must be "${MANIFEST_SCHEMA}" (this library says "${String(m.schema)}")`);
  if (typeof m.id !== 'string' || !ID.test(m.id)) out.push('id must be 2-64 lowercase letters, digits, dots, dashes or underscores');
  if (typeof m.name !== 'string' || !m.name.trim()) out.push('name is missing');
  if (typeof m.version !== 'string' || !m.version.trim()) out.push('version is missing');
  if (!REL(m.database)) out.push('database must be a relative path inside the library');
  if (m.sourcesDir !== undefined && !REL(m.sourcesDir)) out.push('sourcesDir must be a relative path inside the library');
  if (m.profile !== undefined && !/^[a-z0-9-]{1,40}$/.test(String(m.profile))) out.push('profile must be a short lowercase name');
  if (m.ftsTable !== undefined && !IDENT.test(String(m.ftsTable))) out.push('ftsTable must be a plain identifier');
  if (m.readOnly !== undefined && m.readOnly !== true) out.push('readOnly cannot be turned off: the app never changes original documents');
  return out;
}

/**
 * Reads and checks a manifest. Every table and column name it carries ends up inside SQL, so names must be plain identifiers
 * (never values): a manifest from an untrusted zip cannot inject SQL. Paths must be relative and stay inside the library.
 * Returns the manifest or a list of what is wrong. Pure.
 */
export function parseManifest(raw: unknown): { manifest: LibraryManifest } | { problems: string[] } {
  const m = raw as Partial<LibraryManifest> | null;
  if (!m || typeof m !== 'object') return { problems: ['The manifest is not a JSON object'] };
  const problems = [
    ...basicProblems(m), ...tableProblems(m.tables ?? {}), ...facetProblems(m.facets ?? []),
    ...(m.files ?? []).filter((f) => !REL(f?.path) || !Number.isFinite(f?.size)).map(() => 'every files entry needs a relative path and a size'),
  ];
  return problems.length ? { problems } : { manifest: { ...(m as LibraryManifest), readOnly: true } };
}

/** Files of the manifest that are missing or the wrong size (a copy that was cut short). Pure. */
export function fileProblems(manifest: LibraryManifest, found: Array<{ path: string; size: number }>): string[] {
  return (manifest.files ?? []).flatMap((f) => {
    const hit = found.find((x) => x.path === f.path);
    if (!hit) return [`${f.path} is missing`];
    return hit.size === f.size ? [] : [`${f.path} is ${hit.size < f.size ? 'cut short' : 'the wrong size'} (${hit.size} of ${f.size} bytes)`];
  });
}
