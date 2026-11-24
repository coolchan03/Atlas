/** The chat's work_in_steps tool: a big request is planned into short steps and done one at a time, each with a prompt held to the budget. The AI is the boundary. */
const mockAsk = jest.fn();
const mockShaped = jest.fn();
jest.mock('../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a), askShaped: (...a: unknown[]) => mockShaped(...a) }));

import { relevantTools } from '../../src/services/tools/relevantTools';
import { workInSteps } from '../../src/workflows/autoSteps';

describe('work_in_steps', () => {
  it('reads a long text in parts first, plans the job, does each step alone from the notes with the latest result handed on, and gives the last result back with the steps listed', async () => {
    const { executeToolCall } = require('../../src/services/tools');
    const calls: Array<{ user: string; label: string }> = [];
    mockShaped.mockImplementation(async (_system: string, user: string, shape: { label: string; grammar?: string }) => {
      if (shape.grammar) return '1. List the decisions.\n2. List who must do what.\n3. Write a short email with both lists.'; // the plan
      calls.push({ user, label: shape.label });
      if (/^Job:/.test(user)) return /DECISION: ship on Friday/.test(user) ? 'DECISION: ship on Friday' : 'This part is about the plan.'; // a part of the text: notes
      return `answer ${calls.filter((c) => !/^Job:/.test(c.user)).length}`; // a step
    });
    const middle = 'DECISION: ship on Friday. ';
    const long = `NOTES ${'we talked about the plan. '.repeat(1500)}${middle}${'and then about lunch. '.repeat(1500)} END`;

    const result = await executeToolCall({ id: 't1', name: 'work_in_steps', arguments: { job: 'turn the meeting notes into an email', text: long } });
    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/Done in 3 steps:\n1\. List the decisions\.\n2\. List who must do what\.\n3\. Write a short email with both lists\./);
    expect(result.content).toMatch(/Final result:\nanswer 3/);
    const parts = calls.filter((c) => /^Job:/.test(c.user));
    const steps = calls.filter((c) => !/^Job:/.test(c.user));
    expect(parts.length).toBeGreaterThan(8); // about 100,000 characters read in parts of a few thousand
    expect(parts[0].label).toMatch(/^Reading part 1 of /);
    expect(steps.map((c) => c.label)).toEqual(['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3']);
    parts.forEach((p) => expect(p.user.length).toBeLessThan(5000));
    steps.forEach((p, i) => { expect(p.user.length).toBeLessThan(5800); if (i > 0) expect(p.user).toContain(`Result of the step before:\nanswer ${i}`); });
    expect(steps[0].user).toMatch(/DECISION: ship on Friday/); // from the middle of the text: it was read, not cut away
    expect(steps[0].user).not.toMatch(/we talked about the plan/); // the steps work from the notes, not the raw text
  });

  it('refuses a plan that is not at least two steps, and an empty answer for a step, with the step named', async () => {
    mockShaped.mockReset();
    mockShaped.mockResolvedValueOnce('1. First, a long enough step.\n2. Second, a long enough step.').mockResolvedValueOnce('first result').mockResolvedValueOnce('   ');
    await expect(workInSteps('a job', 'some text')).rejects.toThrow('The AI gave no answer for the step "Second, a long enough step."');
  });

  it('says what is missing, and a plan the model could not write is an error the chat can read', async () => {
    const { executeToolCall } = require('../../src/services/tools');
    const missing = await executeToolCall({ id: 't2', name: 'work_in_steps', arguments: {} });
    expect(missing.error).toMatch(/job/);
    mockShaped.mockReset();
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
