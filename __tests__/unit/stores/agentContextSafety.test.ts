jest.mock('../../../src/stores/appStore', () => ({
  useAppStore: { getState: jest.fn() },
}));

jest.mock('../../../src/services/hardware', () => ({
  hardwareService: { getTotalMemoryGB: jest.fn(() => 8) },
}));

jest.mock('../../../src/utils/contextLimits', () => ({
  getMaxContextForDevice: jest.fn(() => 16384),
}));

jest.mock('../../../src/atlasTools/models', () => ({
  switchToModelInBackground: jest.fn(),
}));

import { useAppStore } from '../../../src/stores/appStore';
import { useAgentStore } from '../../../src/stores/agentStore';

const mockGetAppState = useAppStore.getState as jest.Mock;

describe('agent context safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAgentStore.setState({ activeAgentId: 'atlas' });
  });

  it('routes active-agent context to the LiteRT setting and respects the model ceiling', () => {
    const updateSettings = jest.fn();
    mockGetAppState.mockReturnValue({
      activeModelId: 'litert-model',
      downloadedModels: [{ id: 'litert-model', engine: 'litert' }],
      settings: { contextLength: 4096, liteRTMaxTokens: 4096 },
      modelMaxContext: 12288,
      updateSettings,
    });

    useAgentStore.getState().updateAgent('atlas', { contextLength: 32768 });

    expect(updateSettings).toHaveBeenCalledWith({ liteRTMaxTokens: 12288 });
    expect(updateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ contextLength: 32768 }));
  });

  it('clamps llama contexts to the device/model ceiling before applying them', () => {
    const updateSettings = jest.fn();
    mockGetAppState.mockReturnValue({
      activeModelId: 'gguf-model',
      downloadedModels: [{ id: 'gguf-model', engine: 'ggml' }],
      settings: { contextLength: 4096, liteRTMaxTokens: 4096 },
      modelMaxContext: 12000,
      updateSettings,
    });

    useAgentStore.getState().updateAgent('atlas', { contextLength: 32768 });

    expect(updateSettings).toHaveBeenCalledWith({ contextLength: 12000 });
  });
});
