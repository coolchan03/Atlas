/**
 * A chat message that asks for several things is planned into steps and done one at a time before the model writes its answer, with the
 * steps said in the chat; Stop ends it; a setting turns it off; a job that fails is answered the usual way. The AI for the steps is the
 * boundary (askShaped); the final answer goes through the real generation with the llama fake.
 */
import { installNativeBoundary, GB } from '../harness/nativeBoundary';
import { makeGenDeps } from '../harness/genDeps';

const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ ...jest.requireActual('../../src/study/engine'), askShaped: (...a: unknown[]) => mockShaped(...a) }));

const BIG = 'Summarise this article about the new office, then list the main actions that follow from it, and write a short friendly email to my team about those actions. The article says the office moves on 1 March and the team meets on Monday.';
const PLAN = '1. Summarise the article.\n2. List the main actions.\n3. Write a short friendly email about the actions.';

async function setup() {
  const boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  const { llmService } = require('../../src/services/llm');
  const { hardwareService } = require('../../src/services/hardware');
  const { startGenerationFn } = require('../../src/screens/ChatScreen/useChatGenerationActions');
  const { useChatStore, useAppStore } = require('../../src/stores');
  boundary.fs!.seedFile('/models/small.gguf', 500 * 1024 * 1024);
  await hardwareService.refreshMemoryInfo();
  await llmService.loadModel('/models/small.gguf');
  const statuses: Array<string | null> = [];
  const send = async (text: string) => {
    const convId = useChatStore.getState().createConversation('txt', 't');
    useChatStore.getState().addMessage(convId, { role: 'user', content: text });
    const { deps } = makeGenDeps({ activeConversationId: convId, setResearchStatus: (s: string | null) => statuses.push(s) });
    boundary.llama!.calls.completion.length = 0;
    boundary.llama!.scriptCompletion({ text: 'Here is your answer.' });
    await startGenerationFn(deps, { targetConversationId: convId, messageText: text, setDebugInfo: () => {} });
    const sent = JSON.stringify(boundary.llama!.calls.completion.map((c: unknown[]) => (c[0] as { messages?: unknown }).messages));
    const chat = useChatStore.getState().conversations.find((c: { id: string }) => c.id === convId);
    return { sent, messages: chat?.messages ?? [], completions: boundary.llama!.calls.completion.length };
  };
  return { send, statuses, useAppStore };
}

describe('big chat requests in steps', () => {
  beforeEach(() => mockShaped.mockReset());

  it('plans the request, does each step, says so in the chat, and gives the model the work to answer from', async () => {
    const { send, statuses } = await setup();
    mockShaped.mockImplementation(async (_s: string, _u: string, shape: { grammar?: string }) => (shape.grammar ? PLAN : `work ${mockShaped.mock.calls.length}`));
    const out = await send(BIG);
    expect(mockShaped).toHaveBeenCalledTimes(4); // the plan and three steps
    expect(out.sent).toMatch(/This request was done in small steps first/);
    expect(out.sent).toMatch(/Final result:\\nwork 4/);
    expect(out.sent).toMatch(/Summarise this article about the new office/); // the message itself is still there
    expect(out.messages.some((m: { content: string; isSystemInfo?: boolean }) => m.isSystemInfo && /Did this in 3 steps:\n1\. Summarise the article\./.test(m.content))).toBe(true);
    expect(statuses.some((s) => /Doing this in steps \(1 of 3\)/.test(s ?? ''))).toBe(true);
    expect(statuses[statuses.length - 1]).toBeNull();
    // The steps tool is not offered for the turn that was already done in steps.
    expect(out.sent).not.toMatch(/work_in_steps/);
  });

  it('leaves a short message, and a big one when the setting is off, alone', async () => {
    const { send, useAppStore } = await setup();
    await send('What is the capital of France?');
    expect(mockShaped).not.toHaveBeenCalled();
    useAppStore.getState().updateSettings({ autoSteps: false });
    const off = await send(BIG);
    expect(mockShaped).not.toHaveBeenCalled();
    expect(off.sent).not.toMatch(/done in small steps/);
  });

  it('answers the message the usual way when the steps cannot be done', async () => {
    const { send } = await setup();
    mockShaped.mockRejectedValue(new Error('No model loaded'));
    const out = await send(BIG);
    expect(out.completions).toBeGreaterThan(0);
    expect(out.sent).not.toMatch(/done in small steps/);
    expect(out.messages.some((m: { role: string; content: string }) => m.role === 'assistant' && /Here is your answer/.test(m.content))).toBe(true);
  });

  it('ends at once when Stop is pressed in the middle, with no answer written', async () => {
    const { send } = await setup();
    const { cancelWorkInSteps } = require('../../src/workflows/autoSteps');
    mockShaped.mockImplementation(async (_s: string, _u: string, shape: { grammar?: string }) => {
      if (shape.grammar) return PLAN;
      if (mockShaped.mock.calls.length === 3) cancelWorkInSteps(); // Stop during the second step
      return 'work';
    });
    const out = await send(BIG);
    expect(mockShaped).toHaveBeenCalledTimes(3); // the third step was never started
    expect(out.completions).toBe(0);
  });
});
