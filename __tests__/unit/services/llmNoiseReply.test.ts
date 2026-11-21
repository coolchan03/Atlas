/**
 * A reply made of placeholder tokens ("<unused19><pad>...") is noise, not an answer: it is stopped early, reported with a reason, never returned
 * as a reply, and the setup is remembered as unreliable. A healthy reply is untouched, even one that mentions such a token.
 */
jest.mock('../../../src/stores/encryptedChatStorage', () => ({ encryptedChatStorage: {
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined),
} }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initLlama } from 'llama.rn';
import RNFS from 'react-native-fs';
import { llmService } from '../../../src/services/llm';
import { useAppStore } from '../../../src/stores/appStore';
import { resetStores, createMockLlamaContext } from '../../utils/testHelpers';
import { createNoiseWatch, describeBadReply, judgeText } from '../../../src/services/outputHealth';
import { __resetLoadGuardForTests } from '../../../src/services/loadGuard';

const mockedInitLlama = initLlama as jest.MockedFunction<typeof initLlama>;
const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;
const MESSAGES = [{ id: '1', role: 'user' as const, content: 'What is 7 plus 5?', timestamp: 0 }];

beforeEach(async () => {
  jest.clearAllMocks();
  resetStores();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  __resetLoadGuardForTests();
  mockedRNFS.exists.mockResolvedValue(true);
  mockedRNFS.stat.mockResolvedValue({ size: 1_000_000, isFile: () => true } as any);
  useAppStore.setState({ settings: { ...useAppStore.getState().settings, inferenceBackend: 'cpu', safeModelLoading: false } });
  await llmService.unloadModel();
});

describe('judging and watching text', () => {
  it('flags text that is mostly placeholder tokens, and leaves normal text and a stray mention alone', () => {
    expect(judgeText('<unused19><unused10><unused5><pad><pad>')).toMatch(/placeholder tokens/);
    expect(judgeText('Twelve. (The word <pad> is a padding token in some tokenizers, but this answer is ordinary text and long enough.)')).toBe('');
    expect(judgeText('')).toBe('');
    expect(judgeText('<unused1> <unused2>')).toBe(''); // two is not enough to call a reply noise
  });

  it('the watch checks every few tokens, and speaks once', () => {
    const watch = createNoiseWatch(4);
    const noise = '<unused19>'.repeat(6);
    expect(watch.check('<unused19>', 1)).toBe('');
    expect(watch.check('<unused19><unused19>', 2)).toBe('');
    expect(watch.check(noise, 6)).toMatch(/placeholder/); // checked at token 6 (the next check after 4)
    expect(watch.check(noise.repeat(2), 12)).toBe(''); // already reported
  });

  it('the message names where it happened and what to do, and never calls noise an answer', () => {
    expect(describeBadReply('cpu', 'x')).toMatch(/placeholder symbols instead of words on the CPU/);
    expect(describeBadReply('cpu', 'x')).toMatch(/no answer was kept/);
    expect(describeBadReply('opencl', 'x')).toMatch(/OpenCL GPU/);
    expect(describeBadReply('opencl', 'x')).toMatch(/Choose CPU or Automatic/);
  });
});

describe('a chat reply that is noise', () => {
  /** Healthy while the file is loaded and checked at load, noisy afterwards (the way a driver or file fault shows up only later). */
  const turnsNoisy = () => {
    const state = { noisy: false };
    const ctx: any = createMockLlamaContext({
      completion: jest.fn(async (_p: unknown, cb: (d: { token: string }) => void) => {
        if (!state.noisy) { for (const t of ['7 plus 5 is ', '12.']) cb({ token: t }); return { text: '7 plus 5 is 12.', tokens_predicted: 6, timings: {} }; }
        for (let i = 0; i < 200; i++) { cb({ token: i % 2 ? '<unused19>' : '<pad>' }); if (ctx.stopped) break; }
        return { text: '<unused19><pad>'.repeat(20), tokens_predicted: 40, timings: {} };
      }),
      stopCompletion: jest.fn(async () => { ctx.stopped = true; }),
    });
    return { ctx, state };
  };

  it('is stopped early, reported with the cause, and is not returned as a reply', async () => {
    const { ctx, state } = turnsNoisy();
    mockedInitLlama.mockResolvedValue(ctx);
    await llmService.loadModel('/models/test.gguf');
    state.noisy = true;
    const onComplete = jest.fn();
    await expect(llmService.generateResponse(MESSAGES, { onComplete })).rejects.toThrow(/placeholder symbols instead of words on the CPU/);
    expect(ctx.stopCompletion).toHaveBeenCalled(); // stopped as soon as it was clear, not at the length limit
    expect(onComplete).not.toHaveBeenCalled(); // never delivered as a finished answer
    expect(llmService.isCurrentlyGenerating()).toBe(false); // and the engine is free for the next message
  });

  it('marks a Gemma 4 setup as unreliable, so it is not trusted as a good one', async () => {
    const { ctx, state } = turnsNoisy();
    mockedInitLlama.mockResolvedValue(ctx);
    await llmService.loadModel('/models/gemma-4-e2b-it-qat.gguf');
    state.noisy = true;
    await expect(llmService.generateResponse(MESSAGES)).rejects.toThrow();
    await new Promise((r) => setImmediate(r));
    const saved = (AsyncStorage.setItem as jest.Mock).mock.calls.map((c) => String(c[1])).join('\n');
    expect(saved).toMatch(/a chat reply was placeholder tokens/);
  });

  it('does not touch a healthy reply, even from the same model', async () => {
    const ctx: any = createMockLlamaContext({
      completion: jest.fn(async (_p: unknown, cb: (d: { token: string }) => void) => { for (const t of ['Seven plus five is ', 'twelve.']) cb({ token: t }); return { text: 'Seven plus five is twelve.', tokens_predicted: 7, timings: {} }; }),
    });
    mockedInitLlama.mockResolvedValue(ctx);
    await llmService.loadModel('/models/gemma-4-e2b-it-qat.gguf');
    await expect(llmService.generateResponse(MESSAGES)).resolves.toBe('Seven plus five is twelve.');
    expect(ctx.stopCompletion).not.toHaveBeenCalled();
  });
});
