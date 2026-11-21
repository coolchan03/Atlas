/**
 * Keyword search through the full-text index, on a real SQLite engine: finds passages by their words (and their stems) in the whole project,
 * follows every way passages are removed, leaves out other projects and switched-off documents, and says "no index" when there is none.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

function load() {
  installRealSqlite();
  const { ragDatabase } = require('../../../src/services/rag/database');
  return ragDatabase;
}
const add = (db: any, project: string, name: string, texts: string[]) => {
  const id = db.insertDocument({ projectId: project, name, path: `/${name}`, size: 1 });
  db.insertChunks(id, texts.map((content, position) => ({ content, position })));
  return id;
};

describe('full-text keyword search', () => {
  it('finds a passage by a word in the question, by its stem, best match first', async () => {
    const db = load();
    await db.ensureReady();
    expect(db.hasFullText).toBe(true);
    add(db, 'p1', 'leases.txt', ['Operating leases are recorded as a right-of-use asset.', 'Revenue is recognised when control passes.', 'A lease liability is measured at the present value of lease payments.']);
    const found = db.searchKeywords('p1', 'How is a lease liability measured?', 10);
    expect(found.map((r: any) => r.position)).toEqual([2, 0]); // two lease passages, the one with more of the words first
    expect(found.every((r: any) => r.name === 'leases.txt')).toBe(true);
  });

  it('keeps to the project, leaves out a switched-off document, and forgets deleted passages', async () => {
    const db = load();
    await db.ensureReady();
    add(db, 'p1', 'a.txt', ['The depreciation schedule uses straight-line.']);
    const other = add(db, 'p2', 'b.txt', ['Depreciation methods differ.']);
    const off = add(db, 'p1', 'c.txt', ['Accelerated depreciation is allowed.']);
    expect(db.searchKeywords('p1', 'depreciation', 10)).toHaveLength(2);
    db.toggleEnabled(off, false);
    expect(db.searchKeywords('p1', 'depreciation', 10).map((r: any) => r.name)).toEqual(['a.txt']);
    db.deleteDocument(other);
    expect(db.searchKeywords('p2', 'depreciation', 10)).toEqual([]);
    db.deleteDocumentsByProject('p1');
    expect(db.searchKeywords('p1', 'depreciation', 10)).toEqual([]);
  });

  it('is not thrown by a question made of search operators, and returns nothing for no usable word', async () => {
    const db = load();
    await db.ensureReady();
    add(db, 'p1', 'a.txt', ['Tax and NOT penalty, "quoted" text near other: words.']);
    expect(() => db.searchKeywords('p1', 'AND OR NOT NEAR "unbalanced (', 10)).not.toThrow();
    expect(db.searchKeywords('p1', 'the of a', 10)).toEqual([]);
  });

  it('is filled for passages that were stored before the index existed', async () => {
    const db = load();
    await db.ensureReady();
    add(db, 'p1', 'a.txt', ['Goodwill is tested for impairment every year.']);
    // Simulate an older install: the index and its version are gone, the passages remain.
    const raw = (db as any).db;
    raw.executeSync('DROP TRIGGER rag_fts_ai'); raw.executeSync('DROP TRIGGER rag_fts_ad'); raw.executeSync('DROP TRIGGER rag_fts_au');
    raw.executeSync('DROP TABLE rag_fts'); raw.executeSync('PRAGMA user_version = 0');
    raw.executeSync('INSERT INTO rag_chunks (content, doc_id, position) VALUES (?, ?, ?)', ['Impairment of goodwill is not reversed.', 1, 1]);
    (db as any).setupFts();
    expect(db.searchKeywords('p1', 'goodwill impairment', 10)).toHaveLength(2);
  });
});

describe('keyword search without the index', () => {
  it('says there is no index, so the caller reads the passages instead', async () => {
    jest.resetModules();
    jest.doMock('@op-engineering/op-sqlite', () => ({
      open: () => ({ executeSync: (sql: string) => { if (/fts5|rag_fts/i.test(sql)) throw new Error('no such module: fts5'); return { rows: [] }; } }),
    }));
    const { ragDatabase } = require('../../../src/services/rag/database');
    await ragDatabase.ensureReady();
    expect(ragDatabase.hasFullText).toBe(false);
    expect(ragDatabase.searchKeywords('p1', 'lease', 5)).toBeNull();
  });
});
