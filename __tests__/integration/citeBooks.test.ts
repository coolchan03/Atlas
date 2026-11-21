/** With "Cite my books" on, a project chat's prompt tells the AI to quote the passage, name the document and say when it is not in the books. */
import { installRealSqlite } from '../harness/sqliteFake';

it('adds the citing rules only when the project asks for them', async () => {
  installRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { embeddingService } = require('../../src/services/rag/embedding');
  jest.spyOn(embeddingService, 'isLoaded').mockReturnValue(true);
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { injectRagContext } = require('../../src/screens/ChatScreen/useChatGenerationActions');
  const project = useProjectStore.getState().createProject({ name: 'REG books', description: '', systemPrompt: '', icon: '#10B981' });
  await ragService.appendProjectDocuments([{ projectId: project.id, name: 'Tax book.pdf', path: '/x', size: 5, enabled: true, createdAt: '2026-01-01', chunks: [{ content: 'Basis is the cost of property.', position: 0 }] }]);
  const plain = await injectRagContext(project.id, 'what is basis', 'BASE');
  expect(plain).toContain('Tax book.pdf');
  expect(plain).not.toContain('Not in your books');
  useProjectStore.getState().updateProject(project.id, { citeBooks: true });
  const cited = await injectRagContext(project.id, 'what is basis', 'BASE');
  expect(cited).toContain('CITE THE BOOKS');
  expect(cited).toContain('Not in your books:');
});
