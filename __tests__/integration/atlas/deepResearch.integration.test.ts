import { buildDeepResearchBrief, cancelDeepResearch, ResearchCancelledError } from '../../../src/services/deepResearch';
import { searchWeb } from '../../../src/services/tools/webSearchProviders';
import { readPage } from '../../../src/services/tools/handlers';
import { holdScreenAwake, releaseScreenAwake } from '../../../src/atlasTools/runtimePower';
jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: () => false }));
jest.mock('../../../src/services/tools/webSearchProviders', () => ({ searchWeb: jest.fn() }));
jest.mock('../../../src/services/tools/handlers', () => ({ braveSearch: jest.fn(), readPage: jest.fn() }));
jest.mock('../../../src/atlasTools/runtimePower', () => ({ holdScreenAwake: jest.fn(), releaseScreenAwake: jest.fn() }));
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
  it('reads a provided HTTPS webpage instead of relying only on search results', async () => {
    const url = 'https://example.com/research';
    const brief = await buildDeepResearchBrief(`Compare findings in ${url} with others`);
    expect(read).toHaveBeenCalledWith(url, 1600);
    expect(brief.sources[0]).toMatchObject({ url, evidenceType: 'webpage' });
    expect(brief.context).toContain('Evidence: webpage');
    expect(brief.context).toContain('https://example.net/report');
  });
  it('does not leak the screen-awake lock on an empty topic or cancellation', async () => {
    await expect(buildDeepResearchBrief('   ')).rejects.toThrow('topic');
    expect(holdScreenAwake).not.toHaveBeenCalled();
    expect(releaseScreenAwake).not.toHaveBeenCalled();
    search.mockImplementationOnce(async () => { cancelDeepResearch(); return { results: [] }; });
    await expect(buildDeepResearchBrief('stop this research')).rejects.toBeInstanceOf(ResearchCancelledError);
    expect(holdScreenAwake).toHaveBeenCalledTimes(1);
    expect(releaseScreenAwake).toHaveBeenCalledTimes(1);
  });
  it('rejects empty topics and supports cancellation between searches', async () => {
    await expect(buildDeepResearchBrief('')).rejects.toThrow('topic');
    search.mockImplementationOnce(async () => { cancelDeepResearch(); return { results: [] }; });
    await expect(buildDeepResearchBrief('cancel me')).rejects.toBeInstanceOf(ResearchCancelledError);
  });
});
