/**
 * A protected project's passages must not stay readable in the full-text index after they are erased: deleting from an FTS5 index only writes
 * tombstones until its segments are merged, so the words of an erased document would still sit in the index file.
 */
import { installRealSqlite } from '../../harness/sqliteFake';

const WORD = 'zyxwvutsrq';
const indexHolds = (db: any, word: string): boolean => {
  const raw = (db as any).db;
  const rows = raw.executeSync('SELECT block FROM rag_fts_data').rows ?? [];
  return rows.some((r: any) => Buffer.from(r.block ?? []).toString('latin1').includes(word));
};

it('forgets the words of an erased project once the index is tidied, and still finds other projects', async () => {
  installRealSqlite();
  const { ragDatabase: db } = require('../../../src/services/rag/database');
  await db.ensureReady();
  const add = (project: string, text: string) => {
    const id = db.insertDocument({ projectId: project, name: `${project}.txt`, path: `/${project}`, size: 1 });
    db.insertChunks(id, [{ content: text, position: 0 }]);
  };
  add('secret', `The ${WORD} account balance is high.`);
  add('other', 'A lease liability is measured at present value.');
  expect(indexHolds(db, WORD)).toBe(true);
  db.deleteDocumentsByProject('secret');
  expect(indexHolds(db, WORD)).toBe(false);
  expect(db.searchKeywords('secret', WORD, 5)).toEqual([]);
  expect(db.searchKeywords('other', 'lease liability', 5)).toHaveLength(1);
});
