/** One agent asking another: who is picked, who is never asked, what the specialist is given, and what happens on a "no". */
const calls: { system: string; user: string }[] = [];
let mockAnswer = 'Roast it about 1 hour 20 minutes at 200C.';
jest.mock('../../../src/atlasTools/models', () => ({ ensureTextModel: async () => undefined }));
jest.mock('../../../src/services/llmJobQueue', () => ({ runBackgroundJob: (fn: () => Promise<unknown>) => fn() }));
jest.mock('../../../src/services/llm', () => ({
  llmService: {
    getPerformanceSettings: () => ({ contextLength: 4096 }),
    getPerformanceStats: () => ({ lastTokensPerSecond: 0, lastTimeToFirstToken: 0, lastTokenCount: 0 }),
    generateResponse: async (msgs: { content: string }[]) => { calls.push({ system: msgs[0].content, user: msgs[1].content }); return mockAnswer; },
  },
}));

import { Alert } from 'react-native';
import { useAgentStore } from '../../../src/stores/agentStore';
import { consultSpecialist, consultable, pickSpecialist, specialistRelevant } from '../../../src/services/agentConsult';

const agents = () => useAgentStore.getState().agents;
const answerAlert = (button: string) => jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.text === button)?.onPress?.(); });

describe('agent consults', () => {
  beforeEach(() => { calls.length = 0; mockAnswer = 'Roast it about 1 hour 20 minutes at 200C.'; });
  afterEach(() => jest.restoreAllMocks());

  it('never offers the Therapist or the pals, nor the agent that is asking', () => {
    const names = consultable(agents(), 'accountant').map((a) => a.name);
    expect(names).toContain('Home Chef');
    expect(names).not.toContain('Therapist');
    expect(names).not.toContain('Accountant');
    expect(agents().filter((a) => a.kind === 'pal').every((a) => !names.includes(a.name))).toBe(true);
  });

  it('picks the chef for cooking and the accountant for tax, and nobody for small talk', () => {
    const pool = consultable(agents());
    expect(pickSpecialist('how long do I roast a chicken', undefined, pool)?.name).toBe('Home Chef');
    expect(pickSpecialist('can I deduct my home office on my taxes', undefined, pool)?.name).toBe('Accountant');
    expect(pickSpecialist('hello there', undefined, pool)).toBeUndefined();
    expect(pickSpecialist('anything', 'home chef', pool)?.name).toBe('Home Chef'); // a name the model gave is trusted
    expect(specialistRelevant('how long do I roast a chicken')).toBe(true);
    expect(specialistRelevant('what time is it')).toBe(false);
  });

  it('asks first, then gives the specialist only the question, in its own voice', async () => {
    const alert = answerAlert('Ask');
    const out = await consultSpecialist({ question: 'How long do I roast a 2 kg chicken?' });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(out).toMatch(/^Asked Home Chef\./);
    expect(out).toContain('1 hour 20 minutes');
    expect(calls).toHaveLength(1);
    expect(calls[0].user).toBe('How long do I roast a 2 kg chicken?'); // the question and nothing else from the chat
    expect(calls[0].system).toMatch(/home cook/i); // the specialist's own prompt
  });

  it('does not call the specialist when the person says no, and tells the assistant to answer itself', async () => {
    answerAlert('Deny');
    const out = await consultSpecialist({ question: 'How long do I roast a chicken?' });
    expect(calls).toHaveLength(0);
    expect(out).toMatch(/did not want to ask Home Chef/);
  });

  it('does not even ask the person when no agent fits', async () => {
    const alert = answerAlert('Ask');
    expect(await consultSpecialist({ question: 'tell me a joke' })).toMatch(/No other agent fits/);
    expect(alert).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('honours an agent switched off for consults', () => {
    const chef = agents().find((a) => a.id === 'home-chef')!;
    useAgentStore.getState().updateAgent(chef.id, { consultable: false });
    expect(consultable(agents()).some((a) => a.id === 'home-chef')).toBe(false);
    useAgentStore.getState().updateAgent(chef.id, { consultable: undefined });
  });
});
