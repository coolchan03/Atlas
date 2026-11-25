/** The archive holds every report a subject wrote (the screen keeps only the newest), with the judge's verdict added later, and pages out newest first. Real database. */
import { installRealSqlite } from '../../harness/sqliteFake';

const report = (n: number) => ({ id: `r${n}`, itemId: `i${n}`, q: `Question ${n}`, text: `Report ${n}`, sources: 'src', at: 1_700_000_000_000 + n, status: 'waiting' as const });

it('counts and pages the archive, keeps the original words when archived twice, and records the verdict', () => {
  installRealSqlite();
  const { learningKnowledgeDb: db } = require('../../../src/learning/knowledgeDb');
  for (let n = 0; n < 250; n += 1) db.archiveReport('tax', report(n));
  db.archiveReport('tax', { ...report(3), text: 'rewritten' }); // an already archived report is not changed
  db.archiveReport('law', report(999));
  expect(db.reportCount('tax')).toBe(250);
  expect(db.reportCount('law')).toBe(1);

  db.setArchivedVerdict('r7', { status: 'pass', score: 9, why: 'Sound.' });
  const first = db.reportPage('tax', 100, 0);
  expect(first).toHaveLength(100);
  expect(first[0].q).toBe('Question 249'); // newest first
  expect(db.reportPage('tax', 100, 200)).toHaveLength(50);
  const seven = db.reportPage('tax', 250, 0).find((r: { id: string }) => r.id === 'r7');
  expect(seven).toMatchObject({ status: 'pass', score: 9, why: 'Sound.' });
  expect(db.reportPage('tax', 250, 0).find((r: { id: string }) => r.id === 'r3').text).toBe('Report 3');
});
