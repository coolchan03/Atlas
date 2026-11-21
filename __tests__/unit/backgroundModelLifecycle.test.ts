/**
 * The background model and the chat model: a failed background load never changes the person's chat choice or strands the chat without a model,
 * a failed restore is retried, and nothing is swapped while a reply is being written.
 */
jest.mock('../../src/atlasTools/models', () => ({ ensureTextModel: jest.fn() }));
jest.mock('../../src/services/llm', () => ({ llmService: { isCurrentlyGenerating: jest.fn(() => false) } }));

import { useAppStore } from '../../src/stores/appStore';
import { createDownloadedModel } from '../utils/factories';
import { useBackgroundModelNow as switchToBackgroundModel, scheduleChatModelRestore } from '../../src/study/backgroundModel'; // aliased: the hooks lint rule reads "use..." as a React hook

const { ensureTextModel } = require('../../src/atlasTools/models') as { ensureTextModel: jest.Mock };
const { llmService } = require('../../src/services/llm') as { llmService: { isCurrentlyGenerating: jest.Mock } };

beforeEach(() => {
  jest.useFakeTimers();
  ensureTextModel.mockReset().mockResolvedValue(undefined);
  llmService.isCurrentlyGenerating.mockReset().mockReturnValue(false);
  useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'big' }), createDownloadedModel({ id: 'small' })], loadedTextModelId: 'big', activeModelId: 'big' });
  useAppStore.getState().updateSettings({ backgroundModelId: 'small' });
});
afterEach(async () => { await jest.advanceTimersByTimeAsync(200_000); jest.useRealTimers(); });

describe('loading the background model', () => {
  it('a load that fails puts the chat choice back and leaves nothing to "restore" later', async () => {
    ensureTextModel.mockImplementationOnce(async (id: string) => { useAppStore.getState().setActiveModelId(id); throw new Error('not enough memory'); }); // selected, then failed
    await expect(switchToBackgroundModel()).rejects.toThrow('not enough memory');
    expect(useAppStore.getState().activeModelId).toBe('big'); // the person's choice is not left on the background model
    ensureTextModel.mockClear();
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(50_000);
    expect(ensureTextModel).not.toHaveBeenCalled(); // nothing was switched, so nothing is "restored"
  });

  it('a load that works keeps the chat choice and brings the chat model back when work goes quiet', async () => {
    await switchToBackgroundModel();
    expect(useAppStore.getState().activeModelId).toBe('big');
    useAppStore.setState({ loadedTextModelId: 'small' });
    ensureTextModel.mockClear();
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(46_000);
    expect(ensureTextModel).toHaveBeenCalledWith('big');
  });
});

describe('putting the chat model back', () => {
  async function switchedToBackground() {
    await switchToBackgroundModel();
    useAppStore.setState({ loadedTextModelId: 'small' });
    ensureTextModel.mockReset();
  }

  it('waits while a reply is being written, then restores', async () => {
    await switchedToBackground();
    llmService.isCurrentlyGenerating.mockReturnValue(true);
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(46_000);
    expect(ensureTextModel).not.toHaveBeenCalled();
    llmService.isCurrentlyGenerating.mockReturnValue(false);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(ensureTextModel).toHaveBeenCalledWith('big');
  });

  it('a failed restore is tried again instead of leaving the chat without its model', async () => {
    await switchedToBackground();
    ensureTextModel.mockRejectedValueOnce(new Error('memory still held')).mockResolvedValue(undefined);
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(46_000);
    expect(ensureTextModel).toHaveBeenCalledTimes(1);
    useAppStore.setState({ loadedTextModelId: 'small' });
    await jest.advanceTimersByTimeAsync(16_000);
    expect(ensureTextModel).toHaveBeenCalledTimes(2);
    expect(ensureTextModel).toHaveBeenLastCalledWith('big');
  });

  it('gives up after a few tries and does not retry forever', async () => {
    await switchedToBackground();
    ensureTextModel.mockRejectedValue(new Error('no memory'));
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(46_000 + 16_000 * 4);
    expect(ensureTextModel).toHaveBeenCalledTimes(3); // the first try and two retries
  });

  it('does nothing when the person already loaded another model in the meantime', async () => {
    await switchedToBackground();
    useAppStore.setState({ loadedTextModelId: 'big' }); // an ordinary chat loaded the chat model itself
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(46_000);
    expect(ensureTextModel).not.toHaveBeenCalled();
  });

  it('new background work cancels a pending restore (the chat model waits)', async () => {
    await switchedToBackground();
    scheduleChatModelRestore();
    await jest.advanceTimersByTimeAsync(30_000);
    await switchToBackgroundModel(); // more work starts
    await jest.advanceTimersByTimeAsync(30_000);
    expect(ensureTextModel).not.toHaveBeenCalledWith('big');
  });
});
