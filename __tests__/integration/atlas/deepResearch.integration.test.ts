import { buildDeepResearchBrief, cancelDeepResearch, ResearchCancelledError } from '../../../src/services/deepResearch';
import { searchWeb } from '../../../src/services/tools/webSearchProviders';
import { readPage } from '../../../src/services/tools/handlers';
jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => false }));
jest.mock('../../../src/services/tools/webSearchProviders', () => ({ searchWeb: jest.fn() }));
jest.mock('../../../src/services/tools/handlers', () => ({ braveSearch: jest.fn(), readPage: jest.fn() }));
const search = searchWeb as jest.Mock;
const read = readPage as jest.Mock;
describe('Deep Research evidence is per-turn and source-cited', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search.mockResolvedValue({
      results: [
        { title: 'Primary source', url: 'https://example.org/report#heading', snippet: 'Evidence summary' },
        { title: 'Another source', url: 'https://example.net/report', snippet: 'Opposing evidence' },
      ],
    });
    read.mockResolvedValue('Verified article text including dates and facts.');
  });
  it('searches repeatedly, deduplicates source links and reads pages', async () => {
    const statuses: string[] = [];
    const brief = await buildDeepResearchBrief('Some question', {
      contextLength: 4096, onStatus: s => { if (s) statuses.push(s); },
    });
    expect(search).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledTimes(2);
    expect(brief.sources).toHaveLength(2);
    expect(brief.context).toContain('https://example.org/report');
    expect(brief.context).toContain('cite claims using [1], [2]');
    expect(statuses).toContain('Synthesizing report…');
  });
  it('keeps snippets when publishers block full-page reads', async () => {
    read.mockRejectedValue(new Error('blocked'));
    const brief = await buildDeepResearchBrief('Some question');
    expect(brief.context).toContain('Evidence summary');
  });
  it('rejects empty topics and supports cancellation between searches', async () => {
    await expect(buildDeepResearchBrief('')).rejects.toThrow('topic');
    search.mockImplementationOnce(async () => { cancelDeepResearch(); return { results: [] }; });
    await expect(buildDeepResearchBrief('cancel me')).rejects.toBeInstanceOf(ResearchCancelledError);
  });
});
