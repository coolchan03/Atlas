/**
 * Multi-step helpers on screen: pick the bank statement job, paste a statement, answer the one question the AI could
 * not settle, read the proof that every transaction is in, approve, and get the Save CSV button.
 * The AI is the device boundary here (one function), everything else is real.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('../../../src/study/engine', () => ({
  askModel: jest.fn(async () => '[{"n":1,"category":"Income","sure":true},{"n":2,"category":"Groceries","sure":false}]'),
}));

const STATEMENT = `Beginning balance 1,000.00
01/03 PAYROLL ACME INC 2,500.00 3,500.00
01/05 GROCERY OUTLET #12 -86.40 3,413.60
Ending balance 3,413.60`;

it('takes a statement to an approved, proven CSV with one question to the person', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { WorkflowsScreen } = require('../../../src/workflows/WorkflowsScreen');
  const { useWorkflowRuns } = require('../../../src/workflows/service');
  useWorkflowRuns.setState({ runs: [], rules: {} });

  const view = rtl.render(React.createElement(WorkflowsScreen));
  rtl.fireEvent.press(view.getByTestId('workflow-accountant'));
  expect(view.getByTestId('workflow-start').props.accessibilityState?.disabled).toBe(true);
  rtl.fireEvent.changeText(view.getByTestId('workflow-text'), STATEMENT);
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-start')); });

  expect(await view.findByTestId('workflow-questions')).toBeTruthy();
  expect(view.getByText(/GROCERY OUTLET #12/)).toBeTruthy();
  expect(view.queryByText(/PAYROLL ACME INC.*2500/)).toBeNull(); // the sure one is not asked about
  rtl.fireEvent.press(view.getByTestId('answer-1-Groceries'));
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-continue')); });

  expect(await view.findByTestId('workflow-confirm')).toBeTruthy();
  expect(view.getByText(/All 2 transactions are in the file and the balances add up/)).toBeTruthy();
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('workflow-approve')); });
  expect(await view.findByTestId('workflow-save-csv')).toBeTruthy();
});
