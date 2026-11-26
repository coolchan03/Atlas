/** A background job (Study, Learning, Roundtable) on a LiteRT text model: the one-shot session answers, but never in the middle of a chat reply. */
let mockLoadedLlama = false;
let mockLoadedLiteRT = true;
let mockChatWriting = false;
const mockOneShot = jest.fn(async (_system: string, _user: string) => 'The LiteRT answer.');
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    isModelLoaded: () => mockLoadedLlama,
    getPerformanceStats: () => ({ lastTokensPerSecond: 0, lastTimeToFirstToken: 0, lastTokenCount: 0 }),
    generateResponse: async () => { throw new Error('No model loaded'); },
  },
}));
jest.mock('../../../src/services/litert', () => ({ liteRTService: { isModelLoaded: () => mockLoadedLiteRT, generateToolSelection: (s: string, u: string) => mockOneShot(s, u) } }));
jest.mock('../../../src/services/generationService', () => ({ generationService: { getState: () => ({ isGenerating: mockChatWriting }) } }));

import { askModel } from '../../../src/study/engine';

describe('background jobs on a LiteRT model', () => {
  beforeEach(() => { mockLoadedLlama = false; mockLoadedLiteRT = true; mockChatWriting = false; mockOneShot.mockClear(); });

  it('are answered by the LiteRT one-shot session, with the system and user text as given', async () => {
    expect(await askModel('You are a tutor.', 'Explain tides.')).toBe('The LiteRT answer.');
    expect(mockOneShot).toHaveBeenCalledWith('You are a tutor.', 'Explain tides.');
  });

  it('never run in the middle of a chat reply, which the one-shot session would break', async () => {
    mockChatWriting = true;
    await expect(askModel('s', 'u')).rejects.toThrow(/No model loaded/);
    expect(mockOneShot).not.toHaveBeenCalled();
  });

  it('leave a llama model to the usual route', async () => {
    mockLoadedLlama = true;
    await expect(askModel('s', 'u')).rejects.toThrow(/No model loaded/); // the llama stub here has nothing to say; the point is LiteRT was not used
    expect(mockOneShot).not.toHaveBeenCalled();
  });
});
