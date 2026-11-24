/**
 * "Plan it for me": say a big job, the AI plans short numbered steps (held to a grammar), the person can read them, then Save and run does the
 * steps one at a time, each with only the latest result in full. The AI is the device boundary (two functions).
 */
import { Alert } from 'react-native';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockAsk = jest.fn();
const mockShaped = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a), askShaped: (...a: unknown[]) => mockShaped(...a) }));

it('plans a big job in small steps, shows them, and runs them one after the other', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const { useCustomHelpers } = require('../../../src/workflows/customHelpers');
  const { useWorkflowRuns } = require('../../../src/workflows/service');
  useCustomHelpers.setState({ helpers: [] });
  useWorkflowRuns.setState({ runs: [], rules: {} });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('helper-new'));

  // A plan the grammar would not allow (one step) is refused with a plain sentence.
  mockShaped.mockResolvedValueOnce('1. Only one step here.');
  rtl.fireEvent.changeText(view.getByTestId('helper-idea'), 'turn my meeting notes into an email');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('helper-draft')); });
  expect(alert).toHaveBeenCalledWith('Could not plan the steps', expect.stringMatching(/did not write usable steps/));

  mockShaped.mockResolvedValueOnce('1. List the decisions that were made.\n2. List who has to do what, and by when.\n3. Write a short friendly email with both lists.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('helper-draft')); });
  const [system, user, shape] = mockShaped.mock.calls[1];
  expect(system).toMatch(/2 to 6 short steps/);
  expect(user).toMatch(/turn my meeting notes into an email/);
  expect(shape.grammar).toMatch(/root ::= "1\. " line "2\. " line/);
  expect(view.getByTestId('helper-steps').props.value).toBe('1. List the decisions that were made.\n2. List who has to do what, and by when.\n3. Write a short friendly email with both lists.');
  expect(view.getByTestId('helper-title').props.value).toBe('turn my meeting notes into an email');

  // Save and run opens the helper's input page at once.
  rtl.fireEvent.press(view.getByTestId('helper-save-run'));
  expect(useCustomHelpers.getState().helpers).toHaveLength(1);
  const prompts: string[] = [];
  mockAsk.mockImplementation(async (_s: string, u: string) => { prompts.push(u); return `answer ${prompts.length}`; });
  rtl.fireEvent.changeText(await view.findByTestId('workflow-text'), 'Notes: we chose Friday. Sam sends the invoice by Monday.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-start')); });

  expect(await view.findByTestId('workflow-confirm')).toBeTruthy();
  expect(prompts).toHaveLength(3);
  expect(prompts[0]).toMatch(/Instruction: List the decisions that were made\.[\s\S]*we chose Friday/);
  expect(prompts[2]).toMatch(/Result of the step before:\nanswer 2/);
  expect(view.getByText(/answer 3/)).toBeTruthy();
  alert.mockRestore();
});
