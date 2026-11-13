/** A fresh Teach the AI screen says what to do first, and the hint goes once there is an expert. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

it('tells a new person to add a subject and start a task, and drops the subject hint after adding one', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  const { LearningListScreen } = require('../../../src/screens/LearningListScreen');
  const view = rtl.render(React.createElement(LearningScreen));
  expect(view.getByText(/No reports yet\. Describe a task above and press Start/)).toBeTruthy();
  view.unmount();
  const list = rtl.render(React.createElement(LearningListScreen));
  expect(list.getByTestId('no-experts-hint')).toBeTruthy();
  rtl.fireEvent.changeText(list.getByTestId('new-expert-input'), 'Taxes');
  rtl.fireEvent.press(list.getByTestId('new-expert-add'));
  expect(list.queryByTestId('no-experts-hint')).toBeNull();
});

it('the Teach screen can turn off keeping the screen on while it learns, and the choice is saved', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  const { useLearningStore } = require('../../../src/learning/store');
  const view = rtl.render(React.createElement(LearningScreen));
  const toggle = () => view.getByTestId('learning-keep-awake');
  expect(toggle().props.accessibilityState.checked).toBe(true);
  rtl.fireEvent.press(toggle());
  expect(toggle().props.accessibilityState.checked).toBe(false);
  expect(Object.values(useLearningStore.getState().config).some((c: any) => c.keepAwake === false)).toBe(true);
  rtl.fireEvent.press(toggle());
  expect(toggle().props.accessibilityState.checked).toBe(true);
});

it('Refine with AI suggests a clearer task, which can be used or ignored', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const engine = require('../../../src/study/engine');
  const ask = jest.spyOn(engine, 'askModel').mockResolvedValue('"Improved task: Become an expert in small business income tax: sole proprietors and S corporations, deductions and estimated payments, at an intermediate level, with answers that cite the rule."');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  const { useLearningStore } = require('../../../src/learning/store');
  const view = rtl.render(React.createElement(LearningScreen));
  expect(view.getByTestId('learning-refine')).toBeTruthy();
  rtl.fireEvent.changeText(view.getByPlaceholderText(/Treat wound infections/), 'tax stuff for small business');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('learning-refine')); });
  await rtl.waitFor(() => expect(view.getByTestId('learning-suggestion')).toBeTruthy());
  expect(ask.mock.calls[0][1]).toContain('TASK: tax stuff for small business');
  expect(view.getByText(/Suggested task: Become an expert in small business income tax/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('learning-suggestion-keep'));
  expect(view.queryByTestId('learning-suggestion')).toBeNull();
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId('learning-refine')); });
  await rtl.waitFor(() => expect(view.getByTestId('learning-suggestion-use')).toBeTruthy());
  rtl.fireEvent.press(view.getByTestId('learning-suggestion-use'));
  expect(Object.values(useLearningStore.getState().config).some((c: any) => /^Become an expert in small business income tax/.test(c.topic))).toBe(true);
});

it('the judge is Lenient by default, and the Teach screen can make it Balanced or Strict', () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { LearningScreen } = require('../../../src/screens/LearningScreen');
  const { useLearningStore } = require('../../../src/learning/store');
  const view = rtl.render(React.createElement(LearningScreen));
  expect(view.getByTestId('learning-strictness-lenient').props.accessibilityState.selected).toBe(true);
  expect(view.getByText(/Best for small on-device models/)).toBeTruthy();
  rtl.fireEvent.press(view.getByTestId('learning-strictness-strict'));
  expect(view.getByTestId('learning-strictness-strict').props.accessibilityState.selected).toBe(true);
  expect(Object.values(useLearningStore.getState().config).some((c: any) => c.judgeStrictness === 'strict')).toBe(true);
});
