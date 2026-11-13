/**
 * A textbook bigger than the all-in-one sync message goes across in pieces: text first, then the file in 4 MB pieces, checked,
 * then added to the project with its searchable text. The phone's file storage and SQLite are the device boundary.
 */
import { installRealSqlite } from '../harness/sqliteFake';

const files = new Map<string, Buffer>();
function fakeFs() {
  const fs = require('react-native-fs');
  fs.DocumentDirectoryPath = '/docs';
  fs.exists = async (p: string) => files.has(p);
  fs.mkdir = async () => undefined;
  fs.stat = async (p: string) => ({ size: files.get(p)!.length });
  fs.read = async (p: string, len: number, pos: number) => files.get(p)!.subarray(pos, pos + len).toString('base64');
  fs.writeFile = async (p: string, d: string) => { files.set(p, Buffer.from(d, 'base64')); };
  fs.appendFile = async (p: string, d: string) => { files.set(p, Buffer.concat([files.get(p)!, Buffer.from(d, 'base64')])); };
  fs.unlink = async (p: string) => { files.delete(p); };
  fs.moveFile = async (a: string, b: string) => { files.set(b, files.get(a)!); files.delete(a); };
}

async function setup() {
  files.clear();
  installRealSqlite();
  fakeFs();
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { ragService } = require('../../src/services/rag');
  const docs = require('../../src/services/nearbySync/projectDocs');
  const project = useProjectStore.getState().createProject({ name: 'REG', description: '', systemPrompt: '', icon: '#1D4ED8' });
  return { ragService, docs, projectId: project.id as string };
}

async function addBook(ragService: any, projectId: string, size: number) {
  const book = Buffer.alloc(size, 5);
  files.set('/docs/book.pdf', book);
  await ragService.appendProjectDocuments([{ projectId, name: 'Textbook.pdf', path: '/docs/book.pdf', size, enabled: true, createdAt: '2026-01-01',
    chunks: Array.from({ length: 6000 }, (_, i) => ({ content: `Chapter text number ${i} about basis and gains`, position: i })) }]);
  return book;
}

it('sends a 9 MB textbook to a phone that lacks it, intact and searchable, and sends nothing to a phone that has it', async () => {
  const { ragService, docs, projectId } = await setup();
  const book = await addBook(ragService, projectId, 9 * 1024 * 1024 + 11);
  const pieces: any[] = [];
  expect(await docs.sendMissingDocs([projectId], [], async (p: any) => { pieces.push(JSON.parse(JSON.stringify(p))); })).toBe(1);
  expect(pieces.filter((p) => p.kind === 'docfile')).toHaveLength(3);
  expect(pieces.filter((p) => p.kind === 'doctext').length).toBeGreaterThan(0);
  expect(await docs.sendMissingDocs([projectId], await docs.docsOnPhone([projectId]), async () => { throw new Error('should not send'); })).toBe(0);

  // The other phone: no copy of the book yet.
  for (const d of await ragService.getDocumentsByProject(projectId)) await ragService.deleteDocument(d.id);
  files.delete('/docs/book.pdf');
  expect(await ragService.getDocumentsByProject(projectId)).toHaveLength(0);
  let added = false;
  for (const p of pieces) added = p.kind === 'doctext' ? (docs.receiveDocText(p), added) : (await docs.receiveDocFile(p)) || added;
  expect(added).toBe(true);
  const [doc] = await ragService.getDocumentsByProject(projectId);
  expect(doc).toMatchObject({ name: 'Textbook.pdf', size: book.length });
  expect(files.get(doc.path)!.equals(book)).toBe(true);
  expect((await ragService.getDocumentChunks(doc.id)).length).toBe(6000);
  // Receiving the same book again changes nothing.
  for (const p of pieces) { if (p.kind === 'doctext') docs.receiveDocText(p); else await docs.receiveDocFile(p); }
  expect(await ragService.getDocumentsByProject(projectId)).toHaveLength(1);
});

it('refuses a damaged piece and leaves the project without the document', async () => {
  const { ragService, docs, projectId } = await setup();
  await addBook(ragService, projectId, 5 * 1024 * 1024);
  const pieces: any[] = [];
  await docs.sendMissingDocs([projectId], [], async (p: any) => { pieces.push(JSON.parse(JSON.stringify(p))); });
  for (const d of await ragService.getDocumentsByProject(projectId)) await ragService.deleteDocument(d.id);
  const bad = Buffer.from(pieces[pieces.length - 1].data, 'base64'); bad[0] ^= 1;
  pieces[pieces.length - 1].data = bad.toString('base64');
  let error = '';
  for (const p of pieces) { try { if (p.kind === 'doctext') docs.receiveDocText(p); else await docs.receiveDocFile(p); } catch (e: any) { error = e.message; } }
  expect(error).toMatch(/checksum/i);
  expect(await ragService.getDocumentsByProject(projectId)).toHaveLength(0);
});
