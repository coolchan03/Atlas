/** Typing one sentence on the Scheduled tasks screen makes a task with the right time, and an unclear sentence says what is missing. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));

it('makes a reminder from a sentence and shows it in the list, and explains a sentence it cannot read', () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { ScheduleScreen } = require('../../src/schedule/ScheduleScreen');
  const { useSchedule } = require('../../src/schedule/store');
  useSchedule.setState({ tasks: [] });
  const view = rtl.render(React.createElement(ScheduleScreen));

  rtl.fireEvent.changeText(view.getByTestId('quick-reminder-input'), 'call Mom');
  rtl.fireEvent.press(view.getByTestId('quick-reminder-add'));
  expect(view.getByTestId('quick-reminder-note').props.children).toContain('time');
  expect(useSchedule.getState().tasks).toHaveLength(0);

  rtl.fireEvent.changeText(view.getByTestId('quick-reminder-input'), 'remind me to stretch every weekday at 8am');
  rtl.fireEvent.press(view.getByTestId('quick-reminder-add'));
  expect(useSchedule.getState().tasks).toHaveLength(1);
  expect(useSchedule.getState().tasks[0]).toMatchObject({ name: 'stretch', repeat: 'weekdays', hour: 8, minute: 0, enabled: true });
  expect(view.getByTestId('quick-reminder-note').props.children).toContain('Reminder set: stretch');
  expect(view.getAllByText('stretch').length).toBeGreaterThan(0);
});
