const mockAsk = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a) }));
const mockTool = jest.fn();
jest.mock('../../../src/services/tools', () => ({ executeToolCall: (...a: unknown[]) => mockTool(...a) }));

import { useChatStore, useAppStore } from '../../../src/stores';
import { runStepsInChat, stepSummary, enabledToolsFor } from '../../../src/services/stepChat';

const plan = (steps: unknown[]) => (system: string) => Promise.resolve(system.startsWith('You break') ? JSON.stringify(steps) : system.startsWith('Write the final') ? 'Final answer.' : 'step result');

beforeEach(() => {
  mockAsk.mockReset(); mockTool.mockReset();
  useChatStore.setState({ conversations: [], activeConversationId: null } as any);
  useAppStore.getState().updateSettings({ enabledTools: ['calculator'] } as any);
});

describe('work through steps in a chat', () => {
  it('saves the message and a final answer with a step summary, using only enabled tools', async () => {
    const id = useChatStore.getState().createConversation('m', 'T');
    mockAsk.mockImplementation(plan([{ title: 'calc', tool: 'calculator', args: { expression: '1+1' } }, { title: 'shell it', tool: 'shell' }]));
    mockTool.mockResolvedValue({ content: '2' });
    expect(await runStepsInChat(id, 'what is 1+1?')).toBe(true);
    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool.mock.calls[0][0]).toMatchObject({ name: 'calculator', arguments: { expression: '1+1' } });
    const msgs = useChatStore.getState().conversations.find((c) => c.id === id)!.messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1].content).toContain('Final answer.');
    expect(msgs[1].content).toContain('✓ 1. calc');
  });

  it('adds nothing and returns false when the model makes no usable plan, so the message is sent normally', async () => {
    const id = useChatStore.getState().createConversation('m', 'T');
    mockAsk.mockResolvedValue('I will just answer.');
    expect(await runStepsInChat(id, 'hello')).toBe(false);
    expect(useChatStore.getState().conversations.find((c) => c.id === id)!.messages).toHaveLength(0);
  });

  it('shows a failed step in the summary rather than hiding it', async () => {
    const id = useChatStore.getState().createConversation('m', 'T');
    mockAsk.mockImplementation(plan([{ title: 'calc', tool: 'calculator', args: {} }]));
    mockTool.mockResolvedValue({ content: '', error: 'bad expression' });
    await runStepsInChat(id, 'x');
    const last = useChatStore.getState().conversations.find((c) => c.id === id)!.messages.pop()!;
    expect(last.content).toContain('✗ 1. calc (failed: bad expression)');
  });

  it('lists only real, enabled tools', () => {
    expect(enabledToolsFor(undefined)).toEqual(['calculator']);
    expect(enabledToolsFor({ enabledTools: ['calculator', 'nonsense'] })).toEqual(['calculator']);
    expect(stepSummary([])).toBe('');
  });
});
