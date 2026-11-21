import { parseToolCallsFromText } from '../../../src/services/toolCallParsing';
import { buildDateContext, buildExactTimeNote } from '../../../src/services/toolLoopTime';
import * as loop from '../../../src/services/generationToolLoop';

describe('tool calls read from plain text (own module)', () => {
  it('reads a JSON tool_call block and removes it from the text', () => {
    const { cleanText, toolCalls } = parseToolCallsFromText('Let me check. <tool_call>{"name":"calculator","arguments":{"expression":"2+2"}}</tool_call>');
    expect(cleanText).toBe('Let me check.');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ name: 'calculator', arguments: { expression: '2+2' } });
  });
  it('reads an unclosed block at the end of the text', () => {
    expect(parseToolCallsFromText('<tool_call>{"name":"web_search","arguments":{"query":"x"}}').toolCalls[0].name).toBe('web_search');
  });
  it('is still exported from the tool loop for existing callers', () => {
    expect(loop.parseToolCallsFromText).toBe(parseToolCallsFromText);
  });
});

describe('date text for prompts', () => {
  const parts = { dateStr: '2026-11-19', timeStr: '09:05:00', dayOfWeek: 'Thursday', tz: 'UTC' };
  it('keeps the system date stable and the exact time separate', () => {
    expect(buildDateContext(parts)).toContain('2026-11-19');
    expect(buildDateContext(parts)).not.toContain('09:05');
    expect(buildExactTimeNote(parts)).toContain('2026-11-19T09:05:00, UTC');
  });
});
