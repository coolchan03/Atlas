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
