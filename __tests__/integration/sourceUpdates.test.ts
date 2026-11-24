/**
 * Looking for newer sources from a project chat: only official pages are kept, each is marked newer/same/older in code against what the project
 * holds, and a page is added only after the person agrees. A newer edition then replaces the older one in answers.
 */
import { doMockRealSqlite } from '../harness/sqliteFake';
import { installNativeBoundary } from '../harness/nativeBoundary';
import { Alert } from 'react-native';

const mockSearch = jest.fn();
jest.mock('../../src/services/tools/webSearchProviders', () => ({ searchWeb: (...a: unknown[]) => mockSearch(...a) }));

const PAGE = `<html><body><p>Skip to main content</p><h1>Publication 17 (2024), Your Federal Income Tax</h1><p>${'Filing status and dependents are explained here. '.repeat(20)}</p></body></html>`;

it('finds newer official pages marked in code, refuses other sites and PDFs, adds only after consent, and retires the older edition', async () => {
  installNativeBoundary({ fs: true });
  doMockRealSqlite();
  const { ragService } = require('../../src/services/rag');
  const { embeddingService } = require('../../src/services/rag/embedding');
  jest.spyOn(embeddingService, 'isLoaded').mockReturnValue(true);
  jest.spyOn(embeddingService, 'load').mockResolvedValue(undefined);
  jest.spyOn(embeddingService, 'embedBatch').mockImplementation(async (ts: unknown) => (ts as string[]).map(() => [1, 0, 0]));
  jest.spyOn(embeddingService, 'embed').mockResolvedValue([1, 0, 0]);
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { executeToolCall } = require('../../src/services/tools/handlers');
  const project = useProjectStore.getState().createProject({ name: 'Federal tax', description: '', systemPrompt: '', icon: '#10B981' });
  await ragService.appendProjectDocuments([{ projectId: project.id, name: 'IRS Pub 17 (2023).pdf', path: '/x', size: 5, enabled: true, createdAt: '2026-01-01', chunks: [{ content: 'Filing status in 2023.', position: 0 }] }]);
  const call = (name: string, args: Record<string, unknown>) => executeToolCall({ id: name, name, arguments: args, context: { projectId: project.id } });

  mockSearch.mockResolvedValue({ provider: 'x', notes: [], results: [
    { title: 'Publication 17 (2024), Your Federal Income Tax', url: 'https://www.irs.gov/publications/p17', snippet: 'Your Federal Income Tax for individuals.' },
    { title: 'Publication 17 (2022)', url: 'https://www.irs.gov/pub/irs-prior/p17--2022.pdf', snippet: 'old' },
    { title: 'Everything about Publication 17 (2025)', url: 'https://taxblog.example.com/pub17', snippet: 'not official' },
  ] });
  const found = (await call('source_updates', { source: 'IRS Pub 17' })).content;
  expect(found).toContain('The project holds: IRS Pub 17 (2023).pdf');
  expect(found).toMatch(/Publication 17 \(2024\)[\s\S]*Checked in code: NEWER than "IRS Pub 17 \(2023\)\.pdf"/);
  expect(found).toMatch(/Publication 17 \(2022\)[\s\S]*Checked in code: OLDER than "IRS Pub 17 \(2023\)\.pdf"/);
  expect(found).not.toContain('taxblog.example.com');

  // Not an official site, and a PDF: refused without asking or fetching.
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.text === 'Allow')?.onPress?.(); });
  const fetchMock = jest.fn(async () => ({ ok: true, url: 'https://www.irs.gov/publications/p17', text: async () => PAGE }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  expect((await call('add_source', { url: 'https://taxblog.example.com/pub17' })).content).toMatch(/not one of this project's official sites/);
  expect((await call('add_source', { url: 'https://www.irs.gov/pub/irs-pdf/p17.pdf' })).content).toMatch(/is a PDF/);
  expect(alert).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();

  // The person says no: nothing is fetched or saved.
  alert.mockImplementationOnce((_t, _m, buttons) => { buttons?.find((b) => b.text === 'Deny')?.onPress?.(); });
  expect((await call('add_source', { url: 'https://www.irs.gov/publications/p17' })).content).toMatch(/declined/);
  expect(fetchMock).not.toHaveBeenCalled();

  // The person says yes: the page is saved under its heading, and the 2023 edition is retired.
  const added = (await call('add_source', { url: 'https://www.irs.gov/publications/p17' })).content;
  expect(alert.mock.calls.at(-1)?.[1]).toContain('https://www.irs.gov/publications/p17');
  expect(added).toContain('Added "Publication 17 (2024), Your Federal Income Tax (irs.gov)"');
  expect(added).toContain('no longer used in answers: IRS Pub 17 (2023).pdf');
  const names = (await ragService.getDocumentsByProject(project.id)).map((d: { name: string }) => d.name);
  expect(names.some((n: string) => n.startsWith('Publication 17 (2024)'))).toBe(true);
});

it('checks a court case\'s later treatment through the web search, showing the signals found in each result', async () => {
  jest.resetModules();
  const { executeToolCall } = require('../../src/services/tools/handlers');
  const calls: string[] = [];
  mockSearch.mockImplementation(async (q: string) => { calls.push(q); return { provider: 'x', notes: [], results: [
    { title: 'Chevron v. NRDC overruled by Loper Bright', url: 'https://www.courtlistener.com/opinion/1/loper-bright/', snippet: 'The Court held that Chevron is overruled and courts must exercise independent judgment.' },
    { title: 'Smith v. Commissioner affirmed', url: 'https://law.example.org/smith', snippet: 'The appeals court affirmed the Tax Court and later courts followed the holding.' },
    { title: 'Unrelated page', url: 'https://example.org/x', snippet: 'Nothing about treatment here.' },
  ] }; });
  const out = (await executeToolCall({ id: 'c', name: 'case_status', arguments: { case: 'Chevron U.S.A. v. NRDC, 467 U.S. 837 (1984)' }, context: { projectId: 'p' } })).content;
  expect(calls).toHaveLength(3);
  expect(calls[0]).toContain('"Chevron U.S.A. v. NRDC, 467 U.S. 837 (1984)" overruled OR reversed');
  expect(out).toContain('3 results, 1 with negative words');
  expect(out).toMatch(/Chevron v\. NRDC overruled by Loper Bright[\s\S]*Signals: negative \(overruled\)/);
  expect(out).toMatch(/Smith v\. Commissioner affirmed[\s\S]*Signals: positive \(affirmed\)/);
  expect(out).toMatch(/Unrelated page[\s\S]*Signals: none in this text/);
  expect(out).toContain('open the page with read_url');
});
