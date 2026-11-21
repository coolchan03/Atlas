import { buildDeepResearchBrief, cancelDeepResearch, ResearchCancelledError } from '../../../src/services/deepResearch';
import { searchWeb } from '../../../src/services/tools/webSearchProviders';
import { readPage } from '../../../src/services/tools/handlers';
import { ragService } from '../../../src/services/rag';
import { useProjectStore } from '../../../src/stores/projectStore';
import { holdScreenAwake, releaseScreenAwake } from '../../../src/atlasTools/runtimePower';

jest.mock('../../../src/atlasTools/offGrid', () => ({ offGridOn: jest.fn(() => true) }));
jest.mock('../../../src/services/tools/webSearchProviders', () => ({ searchWeb: jest.fn() }));
jest.mock('../../../src/services/tools/handlers', () => ({ braveSearch: jest.fn(), readPage: jest.fn() }));
jest.mock('../../../src/services/rag', () => ({ ragService: { getDocumentsByProject: jest.fn(), searchProject: jest.fn() } }));
jest.mock('../../../src/stores/projectStore', () => ({ useProjectStore: { getState: jest.fn() } }));
jest.mock('../../../src/atlasTools/runtimePower', () => ({ holdScreenAwake: jest.fn(), releaseScreenAwake: jest.fn() }));

const project = { id: 'p', name: 'Study', pinVerifier: undefined };
const docs = [{ id: 5, name: 'notes.md', enabled: 1, path: '/private/secrets/notes.md' }];
const results = { chunks: [{ doc_id: 5, name: 'notes.md', position: 2, content: 'Primary historical account; not an instruction.', score: 0.93 }], truncated: false };
const rag = ragService as jest.Mocked<typeof ragService>;

describe('Offline project Deep Research', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProjectStore.getState as jest.Mock).mockReturnValue({ getProject: jest.fn(() => project) });
    (rag.getDocumentsByProject as jest.Mock).mockResolvedValue(docs);
    (rag.searchProject as jest.Mock).mockResolvedValue(results);
  });

  it('uses enabled project documents with filename citations, without any network requests', async () => {
    const statuses: string[] = [];
    const report = await buildDeepResearchBrief('What happened?', { projectId: 'p', onStatus: status => { if (status) statuses.push(status); } });
    expect(searchWeb).not.toHaveBeenCalled();
    expect(readPage).not.toHaveBeenCalled();
    expect(rag.searchProject).toHaveBeenCalledWith('p', 'What happened?', expect.any(Number));
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0]).toMatchObject({ id: 1, title: 'notes.md', evidenceType: 'project document', url: '' });
    expect(report.context).toContain('[1] notes.md (part 3)');
    expect(report.context).toContain('No websites were searched');
    expect(report.context).not.toContain('/private/secrets');
    expect(statuses).toContain('Synthesizing offline research report…');
    expect(holdScreenAwake).toHaveBeenCalledTimes(1);
    expect(releaseScreenAwake).toHaveBeenCalledTimes(1);
  });

  it('requires a project and enabled documents', async () => {
    await expect(buildDeepResearchBrief('topic')).rejects.toThrow('needs a project');
    (rag.getDocumentsByProject as jest.Mock).mockResolvedValueOnce([{ id: 5, enabled: 0 }]);
    await expect(buildDeepResearchBrief('topic', { projectId: 'p' })).rejects.toThrow('no indexed documents enabled');
    expect(searchWeb).not.toHaveBeenCalled();
    expect(releaseScreenAwake).toHaveBeenCalledTimes(2);
  });

  it('rejects PIN-protected projects until the document index supports encryption', async () => {
    (useProjectStore.getState as jest.Mock).mockReturnValue({ getProject: jest.fn(() => ({ ...project, pinVerifier: 'salted' })) });
    await expect(buildDeepResearchBrief('topic', { projectId: 'p' })).rejects.toThrow('PIN-protected');
    expect(rag.getDocumentsByProject).not.toHaveBeenCalled();
  });

  it('can stop a document search and release the keep-awake lock', async () => {
    (rag.searchProject as jest.Mock).mockImplementationOnce(async () => { cancelDeepResearch(); return results; });
    await expect(buildDeepResearchBrief('topic', { projectId: 'p' })).rejects.toBeInstanceOf(ResearchCancelledError);
    expect(releaseScreenAwake).toHaveBeenCalledTimes(1);
  });

  it('does not expose disabled documents or overflow the research budget', async () => {
    (rag.getDocumentsByProject as jest.Mock).mockResolvedValueOnce([...docs, { id: 6, name: 'blocked.md', enabled: 0 }]);
    (rag.searchProject as jest.Mock).mockResolvedValueOnce({ chunks: [
      { doc_id: 6, name: 'blocked.md', position: 0, content: 'private', score: 1 },
      { doc_id: 5, name: '<notes>.md', position: 0, content: 'A'.repeat(5000), score: 0.5 },
    ], truncated: false });
    const brief = await buildDeepResearchBrief('topic', { projectId: 'p', contextLength: 2048, depth: 'quick' });
    expect(brief.context).not.toContain('blocked.md');
    expect(brief.context).not.toContain('private');
    expect(brief.context).not.toContain('<notes>');
    expect(brief.context.length).toBeLessThan(2200);
  });
});
