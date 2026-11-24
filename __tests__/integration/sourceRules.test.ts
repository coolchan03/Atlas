/**
 * A tax project's prompt ranks its sources by authority, not date, labels each excerpt with what it is (a Public Law, a Tax Court memorandum
 * that does not bind), and uses the person's own rules instead when they wrote some. A wrong guess about a document's type can be corrected.
 */
import { installRealSqlite } from '../harness/sqliteFake';

it('labels excerpts by authority, replaces the built-in rules with the project\'s own, and follows a corrected document type', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { embeddingService } = require('../../src/services/rag/embedding');
  jest.spyOn(embeddingService, 'isLoaded').mockReturnValue(true);
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useOfficialDocs } = require('../../src/standards/officialDocs');
  const { injectRagContext } = require('../../src/screens/ChatScreen/useChatGenerationActions');
  const doc = (name: string, content: string) => ({ projectId: project.id, name, path: '/x', size: 5, enabled: true, createdAt: '2026-01-01', chunks: [{ content, position: 0 }] });
  const project = useProjectStore.getState().createProject({ name: 'Federal tax', description: '', systemPrompt: '', icon: '#10B981' });
  await ragService.appendProjectDocuments([
    doc('Public Law 115-97.pdf', 'Section 11011 allows a deduction for qualified business income of pass-through entities.'),
    doc('Smith v Commissioner T.C. Memo 2021-14.pdf', 'The court held the qualified business income deduction does not reach wages paid.'),
    doc('IRS Pub 535 (2024).pdf', 'Business expenses must be ordinary and necessary.'),
  ]);

  const prompt = await injectRagContext(project.id, 'qualified business income deduction', 'BASE');
  expect(prompt).toContain('Rank them, highest first: the Internal Revenue Code and the Public Laws');
  expect(prompt).toContain('Rank decides a conflict, not date');
  expect(prompt).toMatch(/Source \d+: Public Law 115-97\.pdf - Public Law \(session law that amended the Code\)/);
  expect(prompt).toMatch(/Smith v Commissioner T\.C\. Memo 2021-14\.pdf - Tax Court memorandum, not binding precedent, 2021/);
  expect(prompt).not.toContain('is for 2021'); // a case date is not a tax-year edition

  // The person's own rules replace the built-in ones.
  useProjectStore.getState().updateProject(project.id, { sourceRules: 'Only the Code and Public Laws count. Treat every court decision as background.' });
  const own = await injectRagContext(project.id, 'qualified business income deduction', 'BASE');
  expect(own).toContain('set by the user (follow them over any default): Only the Code and Public Laws count.');
  expect(own).not.toContain('Rank them, highest first');

  // A guess corrected by the person: the memorandum is really a regulation they want treated as one.
  useOfficialDocs.getState().setKind('Smith v Commissioner T.C. Memo 2021-14.pdf', 'regulation');
  const fixed = await injectRagContext(project.id, 'qualified business income deduction', 'BASE');
  expect(fixed).toMatch(/Smith v Commissioner T\.C\. Memo 2021-14\.pdf - Treasury regulations \(CFR\), 2021/);
  useOfficialDocs.getState().setKind('Smith v Commissioner T.C. Memo 2021-14.pdf', null);
});
