/**
 * Start a helper from an example in the editor, save it, run it with three answers, and get exact arithmetic from code (no AI step is needed).
 * The AI is the device boundary: here it must never be asked.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockAsk = jest.fn(async () => 'the model must not be asked');
jest.mock('../../../src/study/engine', () => ({ askModel: (...a: unknown[]) => (mockAsk as (...x: unknown[]) => unknown)(...a) }));

it('makes a "Split the bill" helper from an example and works the sum out exactly', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const { useCustomHelpers } = require('../../../src/workflows/customHelpers');
  const { useWorkflowRuns } = require('../../../src/workflows/service');
  useCustomHelpers.setState({ helpers: [] });
  useWorkflowRuns.setState({ runs: [], rules: {} });

  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('helper-new'));
  rtl.fireEvent.press(view.getByTestId('helper-example'));
  rtl.fireEvent.press(view.getByTestId('helper-example-split-bill'));
  expect(view.getByTestId('helper-title').props.value).toBe('Split the bill');
  rtl.fireEvent.press(view.getByTestId('helper-save'));

  const [helper] = useCustomHelpers.getState().helpers;
  expect(helper.title).toBe('Split the bill');
  rtl.fireEvent.press(view.getByTestId(`workflow-custom-${helper.id}`));
  expect(view.getByTestId('workflow-start').props.accessibilityState?.disabled).toBeFalsy(); // calculations need no pasted text
  rtl.fireEvent.changeText(view.getByTestId('workflow-field-f0'), '$50');
  rtl.fireEvent.changeText(view.getByTestId('workflow-field-f1'), '15');
  rtl.fireEvent.changeText(view.getByTestId('workflow-field-f2'), '2');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-start')); });

  expect(await view.findByTestId('workflow-confirm')).toBeTruthy();
  expect(view.getByText(/Tip: 7\.5/)).toBeTruthy();
  expect(view.getByText(/Each pays: 28\.75/)).toBeTruthy();
  expect(mockAsk).not.toHaveBeenCalled();
});
