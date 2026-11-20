/**
 * One project as one ZIP: export the project, what its learner learned (candidates AND verified) and its documents into a bundle folder,
 * then open it on an empty phone. The file system and SQLite are the device boundary; everything else is the real code.
 */
import { installNativeBoundary } from '../harness/nativeBoundary';
import { doMockRealSqlite } from '../harness/sqliteFake';

const BUNDLE = '/cache/bundle';
const NOTE = { q: 'How long to boil water?', answer: 'One minute.', at: 1, score: 8 };

/** A phone with nothing on it: the same disk, but no saved app data. */
async function emptyPhone() {
  await require('@react-native-async-storage/async-storage').clear();
  return phone();
}

function phone() {
  jest.resetModules();
  require('../../src/bootstrap/atlasHooks').registerAtlasHooks();
  doMockRealSqlite();
  return {
    bundle: require('../../src/learning/projectBundle'),
    projects: require('../../src/stores/projectStore').useProjectStore,
    learning: require('../../src/learning/store').useLearningStore,
    rag: require('../../src/services/rag').ragService,
    ledger: require('../../src/learning/claimIngest'),
    memoryDb: require('../harness/memoryKnowledgeDb').memoryKnowledgeDb,
    RNFS: require('react-native-fs'),
  };
}

async function seedPhoneA() {
  installNativeBoundary({ fs: true });
  const a = phone();
  const project = a.projects.getState().createProject({ name: 'Water course', description: 'd', systemPrompt: 'p', icon: '#000' });
  await a.RNFS.mkdir('/docs/files');
  await a.RNFS.writeFile('/docs/files/book.txt', 'Boil water for one minute to make it safe.', 'utf8');
  await a.rag.appendProjectDocuments([{ projectId: project.id, name: 'book.txt', path: '/docs/files/book.txt', size: 42, enabled: true, createdAt: '2026-01-01', chunks: [{ content: 'Boil water for one minute to make it safe.', position: 0 }] }]);
  a.learning.getState().setConfig('expert-water', { topic: 'water', projectId: project.id });
  a.learning.getState().patch('expert-water', { notes: [NOTE], lessons: 'Check numbers against the passage.' });
  const db = a.memoryDb();
  const src = [{ n: 1, title: 'Water manual', kind: 'library', passage: 'Boil water for one minute.', retrievedAt: '2026-01-01T00:00:00.000Z' }];
  for (const [id, text] of [['r1', 'Boil the water for one minute.'], ['r2', 'Let the water settle before drinking.']] as const) {
    db.sql(`INSERT INTO atlas_report_archive (id, subject_id, question, report_text, source_text, source_list_json, original_timestamp, judge_status, judge_score, judge_reason, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, 'expert-water', 'q', text, '', '[]', 1, 'pass', 8, '', '2026-01-01']);
    a.ledger.ingestClaims(db, { topic: 'water', question: `q ${id}`, reportId: id, reportText: `ANSWER: ${text} [1]`, sources: src, reportStatus: 'candidate', reportNote: '' });
  }
  db.reviewClaim({ id: 'r1:claim:1', status: 'verified', actor: 'device-owner-review', reason: 'checked' });
  return { a, db, projectId: project.id as string };
}

it('exports the project, the learner\'s candidates and verified claims, and the documents, and opens them on an empty phone', async () => {
  const { a, db, projectId } = await seedPhoneA();
  const manifest = await a.bundle.writeProjectBundle(projectId, BUNDLE, db);
  expect(manifest.counts).toEqual({ documents: 1, claims: 2, subjects: 1, reports: 2 });
  expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(expect.arrayContaining(['project.json', 'learning/claims.jsonl', 'documents/index.json']));

  // An empty phone (new stores, new databases, the same disk the bundle sits on).
  const b = await emptyPhone();
  const db2 = b.memoryDb();
  const result = await b.bundle.applyProjectBundle(BUNDLE, db2);
  expect(result).toMatchObject({ project: 'Water course', documents: 1, notes: 1 });
  expect(b.projects.getState().projects.map((p: { name: string }) => p.name)).toContain('Water course');
  const docs = await b.rag.getDocumentsByProject(projectId);
  expect(docs.map((d: { name: string }) => d.name)).toEqual(['book.txt']);
  expect((await b.rag.getDocumentChunks(docs[0].id))[0].content).toMatch(/Boil water/);
  expect(db2.getClaim('r1:claim:1').status).toBe('verified');   // verified stays verified when you move your own project
  expect(db2.getClaim('r2:claim:1').status).toBe('candidate');  // and candidates stay candidates
  expect(b.learning.getState().get('expert-water').notes).toEqual([NOTE]);
  expect(b.learning.getState().getConfig('expert-water').projectId).toBe(projectId);

  // Opening the same bundle again adds nothing.
  const again = await b.bundle.applyProjectBundle(BUNDLE, db2);
  expect(again).toMatchObject({ documents: 0, records: 0, notes: 0, questions: 0 });
  expect((await b.rag.getDocumentsByProject(projectId)).length).toBe(1);
});

it('refuses a bundle whose file changed, and changes nothing', async () => {
  const { a, db, projectId } = await seedPhoneA();
  await a.bundle.writeProjectBundle(projectId, BUNDLE, db);
  await a.RNFS.writeFile(`${BUNDLE}/learning/claims.jsonl`, '{"tampered":true}\n', 'utf8');
  const b = await emptyPhone();
  const db2 = b.memoryDb();
  await expect(b.bundle.applyProjectBundle(BUNDLE, db2)).rejects.toThrow(/does not match its checksum/);
  expect(b.projects.getState().projects.map((p: { name: string }) => p.name)).not.toContain('Water course');
  expect(db2.getClaim('r1:claim:1')).toBeFalsy();
});
