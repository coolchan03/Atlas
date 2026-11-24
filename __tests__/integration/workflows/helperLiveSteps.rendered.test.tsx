/** A helper's run opens at once and lists its steps as they are done: done, running, waiting. The AI is the boundary (one function, held until the test lets it go). */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockAsk = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askModel: (...a: unknown[]) => mockAsk(...a), askShaped: jest.fn() }));

it('shows the steps of a helper while they run, with the one being worked on marked', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const { useCustomHelpers } = require('../../../src/workflows/customHelpers');
  const { useWorkflowRuns } = require('../../../src/workflows/service');
  useCustomHelpers.setState({ helpers: [{ id: 'live', title: 'Follow-up', summary: '', help: '', steps: '1. List the decisions.\n2. List the actions.\n3. Write the email.', createdAt: 1 }] });
  useWorkflowRuns.setState({ runs: [], rules: {} });
  const release: Array<(reply: string) => void> = [];
  mockAsk.mockImplementation(() => new Promise<string>((resolve) => { release.push(resolve); }));

  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('workflow-custom-live'));
  rtl.fireEvent.changeText(view.getByTestId('workflow-text'), 'Notes of the meeting.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-start')); });

  const state = (i: number) => view.getByTestId(`workflow-steps-${i}`).props.accessibilityLabel;
  // The run is on screen while the first step is still being worked on.
  expect(state(0)).toBe('List the decisions.: in progress');
  expect(state(1)).toBe('List the actions.: waiting');
  expect(state(2)).toBe('Write the email.: waiting');
  await rtl.act(async () => { release[0]('decisions'); });
  expect(state(0)).toBe('List the decisions.: done');
  expect(state(1)).toBe('List the actions.: in progress');
  await rtl.act(async () => { release[1]('actions'); });
  await rtl.act(async () => { release[2]('email'); });

  // Done with the work: the person is asked to approve, and every step is ticked.
  expect(await view.findByTestId('workflow-confirm')).toBeTruthy();
  expect(state(0)).toBe('List the decisions.: done');
  expect(state(2)).toBe('Write the email.: done');
  expect(state(3)).toBe('Review: waiting'); // the next thing is the person's approval
});
