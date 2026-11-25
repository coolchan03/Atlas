/**
 * Research libraries: large, read-only collections of authoritative documents (law, standards, manuals, reference works)
 * that arrive already indexed. Atlas never rebuilds the index on the phone: it searches the library's own SQLite
 * databases and reads the original text from its source files by byte range. Nothing here knows about any one subject;
 * a subject plugs in through a LibraryProfile (profile.ts) named in the library's manifest.
 */

/** The file name of the manifest at the root of a library folder. */
export const MANIFEST_FILE = 'atlas-library.json';
export const MANIFEST_SCHEMA = 'atlas-research-library/v1';

/** A table of the library's database and the names of its columns, when they differ from the defaults (db.ts DEFAULT_COLUMNS). */
export interface TableMap { table?: string; columns?: Record<string, string> }

/** A field people can filter by (kind, jurisdiction, year...). Declared by the library, so any subject can have its own. */
export interface Facet { key: string; column: string; label?: string }

export interface LibraryManifest {
  schema: typeof MANIFEST_SCHEMA;
  /** Stable id; installing a library with the same id replaces it. */
  id: string;
  name: string;
  /** A version string the library chooses (a date, a build number). */
  version: string;
  description?: string;
  /** Subject profile that supplies citation reading, applicability and precedence rules. 'generic' when absent. */
  profile?: string;
  /** Folder of original files, relative to the library root. Read-only. */
  sourcesDir?: string;
  /** The SQLite database holding documents, passages, links and versions, relative to the library root. */
  database: string;
  tables?: { documents?: TableMap; passages?: TableMap; links?: TableMap; versions?: TableMap };
  /** Full-text table over passages. Default 'passages_fts' (FTS5, rowid = passage id). */
  ftsTable?: string;
  facets?: Facet[];
  /** Instructions for the model about this library, in the library's own words (what is in it, how to cite it, what to distrust). */
  guide?: string;
  /** Files the install checks for presence and size, so a cut-short copy is caught. */
  files?: Array<{ path: string; size: number }>;
  /** Always true in v1: the app never changes original documents. */
  readOnly?: true;
}

/** A document of the library as the app sees it (one row of the documents table). */
export interface LibraryDocument {
  id: string;
  /** The reference the document is cited by (an identifier a person would write). */
  reference: string;
  title: string;
  kind?: string;
  published?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  /** The span of years or periods the document applies to, when the library says so. */
  periodFrom?: number;
  periodTo?: number;
  edition?: string;
  sourcePath?: string;
  sourceUrl?: string;
  checksum?: string;
  status?: string;
  quality?: string;
  /** Every declared facet, by key. */
  facets: Record<string, string>;
}

export interface LibraryPassage {
  id: string;
  documentId: string;
  /** Where in the document: a subsection, a page, a paragraph number. */
  locator?: string;
  byteStart?: number;
  byteEnd?: number;
  text?: string;
}

export interface LibraryLink { fromId: string; toId: string; kind: string; note?: string }
export interface LibraryVersion { family: string; documentId: string; edition?: string; effectiveFrom?: string; effectiveTo?: string }

/** What a question is asked in: filters and the period it is about. */
export interface SearchScope {
  /** A year or period the answer must apply to (a tax year, a code edition year). */
  period?: number;
  /** Facet key -> value (exact match). */
  filters?: Record<string, string>;
  limit?: number;
}

/** One retrieved piece of evidence, with everything needed to cite it and open the original. */
export interface Evidence {
  libraryId: string;
  documentId: string;
  reference: string;
  title: string;
  locator?: string;
  text: string;
  kind?: string;
  facets: Record<string, string>;
  published?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  edition?: string;
  sourcePath?: string;
  sourceUrl?: string;
  checksum?: string;
  /** Whether the document applies to the period asked about: 'yes', 'no', or 'unknown' when the library does not say. */
  applies: 'yes' | 'no' | 'unknown';
  appliesWhy: string;
  /** True only when the library itself records a verified status; never inferred. */
  statusVerified: boolean;
  status?: string;
  quality?: string;
  score?: number;
}

/** A library that is installed on this device. */
export interface InstalledLibrary {
  id: string;
  name: string;
  version: string;
  profile: string;
  /** Folder it was unpacked into (inside the app's storage). */
  dir: string;
  sizeBytes: number;
  installedAt: string;
  manifest: LibraryManifest;
}
