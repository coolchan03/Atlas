/**
 * A skill written as steps, run one step at a time: from the Skills screen (which opens the job) and from the chat's steps tool.
 * Each step is shown only its own instruction, the result before it and the parts of the skill's reference files it is about.
 * The AI is the device boundary (two functions).
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));
const mockAsk = jest.fn();
const mockShaped = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a), askShaped: (...a: unknown[]) => mockShaped(...a) }));

const BODY = `Answer a customer about a return.

1. Find out what was damaged and how the customer got it.
2. Check the refund policy for a damaged parcel and say what applies.
   Quote the number of days.
3. Write a short polite reply that says what happens next.

Never promise more than the policy says.`;
const POLICY = '# Returns\n\nA refund for a damaged parcel is paid within five working days after the parcel is returned.\n\n# Shipping\n\nParcels are sent every Tuesday and Friday from the warehouse.';

it('runs an installed skill step by step from the Skills screen, each step with the reference parts it is about', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { SkillsScreen } = require('../../../src/skills/SkillsScreen');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const { useSkills } = require('../../../src/skills/skillsStore');
  const { useWorkflowRuns } = require('../../../src/workflows/service');
  const { NavigationRouteContext } = require('@react-navigation/native');
  useWorkflowRuns.setState({ runs: [], rules: {} });
  useSkills.setState({ skills: [
    { name: 'refund-helper', description: 'Answer customers about refunds and returns.', body: BODY, userInvocable: true, needs: [], enabled: true, addedAt: 1, resources: [{ name: 'policy.md', text: POLICY }] },
    { name: 'plain-skill', description: 'One paragraph of advice.', body: 'Be kind and brief.', userInvocable: true, needs: [], enabled: true, addedAt: 2 },
  ] });

  const skills = rtl.render(React.createElement(SkillsScreen));
  rtl.fireEvent.press(skills.getByTestId('skill-category-own'));
  expect(skills.queryByTestId('skill-steps-plain-skill')).toBeNull(); // a skill that is not written as steps has no such button
  rtl.fireEvent.press(skills.getByTestId('skill-steps-refund-helper'));
  expect(mockNavigate).toHaveBeenCalledWith('Workflows', { job: 'custom-skill-refund-helper' });
  skills.unmount();

  const prompts: string[] = [];
  mockAsk.mockImplementation(async (_s: string, u: string) => { prompts.push(u); return `result ${prompts.length}`; });
  const jobs = rtl.render(React.createElement(NavigationRouteContext.Provider, { value: { params: { job: 'custom-skill-refund-helper' } } }, React.createElement(WorkflowsScreen)));
  rtl.fireEvent.changeText(await jobs.findByTestId('workflow-text'), 'My parcel arrived damaged. How long until I get a refund?');
  await rtl.act(async () => { rtl.fireEvent.press(jobs.getByTestId('workflow-start')); });
  expect(await jobs.findByTestId('workflow-confirm')).toBeTruthy();

  expect(prompts).toHaveLength(3);
  expect(prompts[0]).toMatch(/Instruction: Find out what was damaged/);
  expect(prompts[1]).toMatch(/Instruction: Check the refund policy for a damaged parcel and say what applies\. Quote the number of days\./); // the indented line joined its step
  expect(prompts[1]).toMatch(/From the reference files:\n\[policy\.md\]\n.*within five working days/s);
  expect(prompts[1]).not.toMatch(/every Tuesday and Friday/);
  expect(prompts[2]).toMatch(/Result of the step before:\nresult 2/);
  expect(prompts[0]).not.toMatch(/Never promise more/); // the closing paragraph is not a step
});

it('lets the chat do an installed skill in steps with the work_in_steps tool, and says plainly when it cannot', async () => {
  installNativeBoundary({ fs: true });
  const { executeToolCall } = require('../../../src/services/tools');
  const { useSkills } = require('../../../src/skills/skillsStore');
  const { skillsNote } = require('../../../src/skills/selectSkills');
  const long = `${BODY}\n\n${'Extra background paragraph about policy. '.repeat(120)}`;
  useSkills.setState({ skills: [
    { name: 'refund-helper', description: 'Answer customers about refunds and returns.', body: long, userInvocable: true, needs: [], enabled: true, addedAt: 1, resources: [{ name: 'policy.md', text: POLICY }] },
    { name: 'plain-skill', description: 'One paragraph of advice.', body: 'Be kind and brief.', userInvocable: true, needs: [], enabled: true, addedAt: 2 },
  ] });
  // The note for a long skill written as steps points the model at the tool; a short one does not.
  expect(skillsNote('/refund-helper my parcel arrived damaged, how long for a refund', useSkills.getState().skills, 4096)).toMatch(/call work_in_steps with skill "refund-helper"/);
  expect(skillsNote('/plain-skill hello there', useSkills.getState().skills, 4096)).not.toMatch(/work_in_steps/);

  const asked: string[] = [];
  mockShaped.mockImplementation(async (_s: string, u: string) => { asked.push(u); return `answer ${asked.length}`; });
  const result = await executeToolCall({ id: 's1', name: 'work_in_steps', arguments: { job: 'my parcel arrived damaged, how long for a refund?', skill: '/refund-helper' } });
  expect(result.error).toBeUndefined();
  expect(result.content).toMatch(/Done in 3 steps:\n1\. Find out what was damaged/);
  expect(asked).toHaveLength(3); // the skill's own steps: no planning call
  expect(asked[1]).toMatch(/\[policy\.md\]/);
  const plain = await executeToolCall({ id: 's2', name: 'work_in_steps', arguments: { job: 'x', skill: 'plain-skill' } });
  expect(plain.error).toMatch(/not written as steps/);
  const none = await executeToolCall({ id: 's3', name: 'work_in_steps', arguments: { job: 'x', skill: 'nothing-here' } });
  expect(none.error).toMatch(/no skill called "nothing-here"/);
});
