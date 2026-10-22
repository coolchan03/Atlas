jest.mock('../../../../src/services/httpClient', () => ({
  createStreamingRequest: jest.fn(),
  parseAnthropicMessage: (event: {data: string}) => JSON.parse(event.data),
}));
jest.mock('../../../../src/stores/appStore', () => ({
  useAppStore: { getState: () => ({ settings: { systemPrompt: 'Local default' } }) },
}));
import { createStreamingRequest } from '../../../../src/services/httpClient';
import { AnthropicProvider, assertClaudeEndpoint, toClaudeMessages } from '../../../../src/services/providers/anthropicProvider';
import type { Message } from '../../../../src/types';

const msg = (role: Message['role'], content: string, extras?: Partial<Message>): Message => ({
  id: 'id-' + role, timestamp: Date.now(), role, content, ...extras,
});
const callbacks = () => ({
  onToken: jest.fn(), onError: jest.fn(), onComplete: jest.fn(),
});
const send = (event: object) => ({ data: JSON.stringify(event) });

describe('Claude API direct integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends credentials only to the official API root', () => {
    expect(assertClaudeEndpoint('https://api.anthropic.com/')).toBe('https://api.anthropic.com');
    for (const url of ['http://api.anthropic.com', 'https://api.anthropic.com.evil.com',
      'https://api.anthropic.com/attacker', 'https://api.anthropic.com@evil.com',
      'https://api.anthropic.com:1234']) {
      expect(() => assertClaudeEndpoint(url)).toThrow();
    }
  });

  it('converts system prompts and batches Claude tool results into user blocks', () => {
    const actual = toClaudeMessages([
      msg('system', 'Instructions'),
      msg('user', 'Compute'),
      msg('assistant', 'Using tools', { toolCalls: [
        { id: 'a', name: 'calculator', arguments: '{"expression":"1+1"}' },
        { id: 'b', name: 'calculator', arguments: '{"expression":"2+2"}' },
      ] }),
      msg('tool', '2', { toolCallId: 'a' }),
      msg('tool', '4', { toolCallId: 'b' }),
    ]);
    expect(actual.system).toBe('Instructions');
    expect(actual.messages[1].content).toEqual([
      { type: 'text', text: 'Using tools' },
      { type: 'tool_use', id: 'a', name: 'calculator', input: { expression: '1+1' } },
      { type: 'tool_use', id: 'b', name: 'calculator', input: { expression: '2+2' } },
    ]);
    expect(actual.messages[2].role).toBe('user');
    expect(actual.messages[2].content).toHaveLength(2);
  });

  it('streams text and complete tool input without auto-executing tools', async () => {
    (createStreamingRequest as jest.Mock).mockImplementation(async (_url, _req, notify) => {
      for (const event of [
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done.' } },
        { type: 'content_block_start', index: 1, content_block: {
          type: 'tool_use', id: 'tool-123', name: 'calculator', input: {},
        } },
        { type: 'content_block_delta', index: 1, delta: {
          type: 'input_json_delta', partial_json: '{"expression":"3+3"}',
        } },
        { type: 'message_stop' },
      ]) notify(send(event));
    });
    const provider = new AnthropicProvider('claude', 'https://api.anthropic.com', 'my-secret');
    await provider.loadModel('claude-test-model');
    const cb = callbacks();
    await provider.generate([msg('user', 'Compute')], {}, cb);
    expect(cb.onToken).toHaveBeenCalledWith('Done.');
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onComplete).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Done.',
      toolCalls: [{ id: 'tool-123', name: 'calculator', arguments: '{"expression":"3+3"}' }],
    }));
    const [url, request] = (createStreamingRequest as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers['x-api-key']).toBe('my-secret');
    expect(request.body.model).toBe('claude-test-model');
    expect(request.body.system).toBe('Local default');
  });

  it('never treats a Claude stream error as successful completion', async () => {
    (createStreamingRequest as jest.Mock).mockImplementation(async (_url, _req, notify) => {
      notify(send({ type: 'error', error: { message: 'Overloaded' } }));
      notify(send({ type: 'message_stop' }));
    });
    const p = new AnthropicProvider('claude', 'https://api.anthropic.com', 'secret');
    await p.loadModel('model');
    const cb = callbacks();
    await p.generate([msg('user', 'Hello')], {}, cb);
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Overloaded' }));
    expect(cb.onComplete).not.toHaveBeenCalled();
  });
});
