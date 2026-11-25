import { LibraryManifest, MANIFEST_SCHEMA } from './types';

const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REL = (p: unknown): p is string => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes('..');

/**
 * Reads and checks a manifest. Every table and column name it carries ends up inside SQL, so names must be plain identifiers
 * (never values): a manifest from an untrusted zip cannot inject SQL. Paths must be relative and stay inside the library.
 * Returns the manifest or a list of what is wrong. Pure.
 */
export function parseManifest(raw: unknown): { manifest: LibraryManifest } | { problems: string[] } {
  const problems: string[] = [];
  const m = raw as Partial<LibraryManifest> | null;
  if (!m || typeof m !== 'object') return { problems: ['The manifest is not a JSON object'] };
  if (m.schema !== MANIFEST_SCHEMA) problems.push(`schema must be "${MANIFEST_SCHEMA}" (this library says "${String(m.schema)}")`);
  if (typeof m.id !== 'string' || !ID.test(m.id)) problems.push('id must be 2-64 lowercase letters, digits, dots, dashes or underscores');
  if (typeof m.name !== 'string' || !m.name.trim()) problems.push('name is missing');
  if (typeof m.version !== 'string' || !m.version.trim()) problems.push('version is missing');
  if (!REL(m.database)) problems.push('database must be a relative path inside the library');
  if (m.sourcesDir !== undefined && !REL(m.sourcesDir)) problems.push('sourcesDir must be a relative path inside the library');
  if (m.profile !== undefined && !/^[a-z0-9-]{1,40}$/.test(String(m.profile))) problems.push('profile must be a short lowercase name');
  if (m.ftsTable !== undefined && !IDENT.test(String(m.ftsTable))) problems.push('ftsTable must be a plain identifier');
  for (const [name, map] of Object.entries(m.tables ?? {})) {
    if (map?.table !== undefined && !IDENT.test(map.table)) problems.push(`tables.${name}.table must be a plain identifier`);
    for (const [field, col] of Object.entries(map?.columns ?? {})) if (!IDENT.test(String(col))) problems.push(`tables.${name}.columns.${field} must be a plain identifier`);
  }
  for (const f of m.facets ?? []) {
    if (!f || !/^[a-z][a-z0-9_]{0,30}$/.test(String(f.key))) problems.push('every facet needs a short lowercase key');
    else if (!IDENT.test(String(f.column))) problems.push(`facet ${f.key}: column must be a plain identifier`);
  }
  for (const f of m.files ?? []) if (!REL(f?.path) || !Number.isFinite(f?.size)) problems.push('every files entry needs a relative path and a size');
  if (m.readOnly !== undefined && m.readOnly !== true) problems.push('readOnly cannot be turned off: the app never changes original documents');
  if (problems.length) return { problems };
  return { manifest: { ...(m as LibraryManifest), readOnly: true } };
}

/** Files of the manifest that are missing or the wrong size (a copy that was cut short). Pure. */
export function fileProblems(manifest: LibraryManifest, found: Array<{ path: string; size: number }>): string[] {
  return (manifest.files ?? []).flatMap((f) => {
    const hit = found.find((x) => x.path === f.path);
    if (!hit) return [`${f.path} is missing`];
    return hit.size === f.size ? [] : [`${f.path} is ${hit.size < f.size ? 'cut short' : 'the wrong size'} (${hit.size} of ${f.size} bytes)`];
  });
}
