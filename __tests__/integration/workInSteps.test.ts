/** The chat's work_in_steps tool: a big request is planned into short steps and done one at a time, each with a prompt held to the budget. The AI is the boundary. */
const mockAsk = jest.fn();
const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a), askShaped: (...a: unknown[]) => mockShaped(...a) }));

import { relevantTools } from '../../src/services/tools/relevantTools';
import { workInSteps } from '../../src/workflows/autoSteps';

describe('work_in_steps', () => {
  it('plans the job, does each step alone with the latest result handed on, and gives the last result back with the steps listed', async () => {
    const { executeToolCall } = require('../../src/services/tools');
    mockShaped.mockResolvedValueOnce('1. List the decisions.\n2. List who must do what.\n3. Write a short email with both lists.');
    const prompts: string[] = [];
    mockAsk.mockImplementation(async (_s: string, u: string) => { prompts.push(u); return `answer ${prompts.length}`; });
    const long = `NOTES ${'we talked about the plan. '.repeat(1500)} END`;

    const result = await executeToolCall({ id: 't1', name: 'work_in_steps', arguments: { job: 'turn the meeting notes into an email', text: long } });
    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/Done in 3 steps:\n1\. List the decisions\.\n2\. List who must do what\.\n3\. Write a short email with both lists\./);
    expect(result.content).toMatch(/Final result:\nanswer 3/);
    expect(prompts).toHaveLength(3);
    prompts.forEach((p, i) => { expect(p.length).toBeLessThan(5800); if (i > 0) expect(p).toContain(`Result of the step before:\nanswer ${i}`); });
    expect(prompts[0]).toMatch(/NOTES/);
    expect(prompts[0]).toMatch(/END/); // the long text is shortened in the middle, both ends stay
    expect(mockShaped.mock.calls[0][2].grammar).toMatch(/root ::= "1\. "/);
  });

  it('refuses a plan that is not at least two steps, and an empty answer for a step, with the step named', async () => {
    mockShaped.mockResolvedValueOnce('1. First, a long enough step.\n2. Second, a long enough step.');
    mockAsk.mockResolvedValueOnce('first result').mockResolvedValueOnce('   ');
    await expect(workInSteps('a job', 'some text')).rejects.toThrow('The AI gave no answer for the step "Second, a long enough step."');
  });

  it('says what is missing, and a plan the model could not write is an error the chat can read', async () => {
    const { executeToolCall } = require('../../src/services/tools');
    const missing = await executeToolCall({ id: 't2', name: 'work_in_steps', arguments: {} });
    expect(missing.error).toMatch(/job/);
    mockShaped.mockResolvedValueOnce('1. Only one step.');
    const bad = await executeToolCall({ id: 't3', name: 'work_in_steps', arguments: { job: 'do something big' } });
    expect(bad.error).toMatch(/did not write usable steps/);
  });

  it('is offered for a message with several parts or a long text, and not for a short plain question', () => {
    const on = ['work_in_steps', 'web_search'];
    const offered = (m: string) => relevantTools(m, on).includes('work_in_steps');
    expect(offered('Summarise this article, then list the main actions and write an email to my team about them.')).toBe(true);
    expect(offered(`Here is my report: ${'text '.repeat(250)}`)).toBe(true);
    expect(offered('Do this step by step please')).toBe(true);
    expect(offered('What is the capital of France?')).toBe(false);
    expect(offered('Write me a haiku')).toBe(false);
  });
});
