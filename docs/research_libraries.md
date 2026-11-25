# Research libraries

A research library is a large, read-only collection of original documents that arrives already indexed (law, accounting standards,
manuals, any reference work). Atlas does not rebuild the index on the device: it searches the library's own SQLite database and reads
original text from its source files by byte range. Nothing in the code is specific to one subject; a subject plugs in through a
*profile* named in the manifest (`generic`, `legal-us`).

## Layout (any folder or .zip with this shape)

```
<library>/
  atlas-library.json     manifest (required)
  Index/<name>.sqlite    documents, passages, links, versions + an FTS5 table over passages
  Sources/...            original files, never modified (optional: passages may carry their own text)
```

`atlas-library.json` (schema `atlas-research-library/v1`): `id`, `name`, `version`, `database` (relative path), optional `profile`,
`sourcesDir`, `ftsTable` (default `passages_fts`, FTS5 with rowid = passage id), `facets` (filterable fields: `[{key, column}]`),
`tables` (table and column names when the library calls them something else), `guide` (instructions to the model, in the library's
words), `files` (path and size of each file, so a cut-short copy is rejected). Names in the manifest end up in SQL, so they must be
plain identifiers; paths must be relative and stay inside the library.

Default tables and columns (all renameable through `tables`):

| table | columns |
|---|---|
| documents | id, reference, title, kind, published, effective_from, effective_to, period_from, period_to, edition, source_path, source_url, checksum, status, quality (+ any facet column) |
| passages | id, document_id, locator, byte_start, byte_end, text (text may be null: the bytes are then read from `source_path`) |
| links | from_id, to_id, kind, note |
| versions | family, document_id, edition, effective_from, effective_to |

## In the app

* Knowledge Base > Research libraries: install from a .zip (validated before it is kept), switch on per project, remove.
* Before every answer in a project that uses a library, Atlas searches it (by typed reference, by topic, and by narrower searches when
  the first is thin) and puts the excerpts in the prompt within about a third of the model's real context. This works for models
  without tool calling.
* Six tools for further research (the loop allows up to 6 rounds and 12 calls on such a turn): `library_search`,
  `library_find_reference`, `library_read` (bounded parts with a cursor), `library_versions`, `library_related`, `library_status`.
* Applicability is decided from the period the library records for a document (periods or effective dates), never from the
  publication date. `library_status` says plainly when the status was not verified.
* `checkAnswer` (researchLibrary/context.ts) finds citation numbers that point at nothing, references that were not retrieved and
  quotations that are not in the text.
