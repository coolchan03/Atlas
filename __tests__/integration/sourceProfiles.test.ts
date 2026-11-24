/**
 * Different fields weigh their documents differently. A markets project ranks a filing over news, never retires an old filing, and marks old market
 * data stale; a project with a profile the person wrote follows it; and looking for updates uses the profile's own sites.
 */
import { doMockRealSqlite } from '../harness/sqliteFake';
import { installNativeBoundary } from '../harness/nativeBoundary';

it('applies a field\'s ranking, dating and sites to the prompt and to the update search', async () => {
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { embeddingService } = require('../../src/services/rag/embedding');
  jest.spyOn(embeddingService, 'isLoaded').mockReturnValue(true);
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { injectRagContext } = require('../../src/screens/ChatScreen/useChatGenerationActions');
  const { findUpdates, resolverFor } = require('../../src/standards/updates');
  const { profileFor, parseProfile } = require('../../src/standards/profiles');
  const project = useProjectStore.getState().createProject({ name: 'Markets', description: '', systemPrompt: '', icon: '#10B981' });
  const doc = (name: string, content: string) => ({ projectId: project.id, name, path: '/x', size: 5, enabled: true, createdAt: '2026-01-01', chunks: [{ content, position: 0 }] });
  await ragService.appendProjectDocuments([
    doc('AAPL 10-K 2022.pdf', 'Apple reported services revenue growth in the annual report.'),
    doc('AAPL 10-K 2023.pdf', 'Apple reported services revenue growth in the annual report for fiscal 2023.'),
    doc('NVDA price history 2024-01-02.csv', 'Apple price closed at 185 dollars on that day, market data.'),
    doc('Analyst note AAPL 2024.pdf', 'Apple services revenue growth outlook according to one analyst.'),
  ]);

  useProjectStore.getState().updateProject(project.id, { profileId: 'equities' });
  const prompt = await injectRagContext(project.id, 'Apple services revenue growth', 'BASE');
  expect(prompt).toContain('Rank them, highest first: SEC filings');
  expect(prompt).toContain('do not tell the user to buy or sell');
  expect(prompt).toMatch(/AAPL 10-K 2022\.pdf - SEC filing, 2022 \(true as of its date\)/); // an old filing is kept: filings are never replaced
  expect(prompt).toMatch(/AAPL 10-K 2023\.pdf - SEC filing, 2023/);
  expect(prompt).toMatch(/Stale: NVDA price history 2024-01-02\.csv is \d+ days old \(Market data older than 1 day is stale\)/);

  // A profile the person wrote: its rules and its own kinds.
  const spec = 'Opinions | opinion, ruling | dated 90\nStatutes | statute, code | edition\nsites: law.example.org\nrules: Statutes control. An opinion only shows how a court read them.';
  useProjectStore.getState().updateProject(project.id, { profileId: 'custom', customProfile: spec });
  const own = await injectRagContext(project.id, 'Apple services revenue growth', 'BASE');
  expect(own).toContain('Statutes control. An opinion only shows how a court read them.');

  // The update search looks only on the profile's sites and marks editions in code.
  const searched: string[] = [];
  const search = async (q: string) => { searched.push(q); return [{ title: 'Statute of Examples (2025)', url: 'https://law.example.org/statute-2025', snippet: 'current text' }, { title: 'Elsewhere', url: 'https://elsewhere.example.net/x' }]; };
  const res = resolverFor(profileFor('custom', spec, []));
  const found = await findUpdates('Statute of Examples', ['Statute of Examples (2023).pdf'], { search, res });
  expect(searched).toEqual(['Statute of Examples site:law.example.org']);
  expect(found).toMatch(/Statute of Examples \(2025\)[\s\S]*NEWER than "Statute of Examples \(2023\)\.pdf"/);
  expect(found).not.toContain('elsewhere.example.net');
  expect(parseProfile('One line only').problems[0]).toMatch(/needs a name/);
});
