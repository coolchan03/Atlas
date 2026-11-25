/** A recorded conversation: the promises, requests and dated to-dos are found in code, owners come from who spoke, and the ones with a day become reminders. */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn() };
  return { useNavigation: () => nav, useRoute: () => ({ params: { id: 'rec1' } }), useFocusEffect: () => {}, useIsFocused: () => true };
});

const u = (speaker: number, start: number, text: string) => ({ speaker, start, end: start + 5, text });

it('finds who promised or was asked what, and sets reminders for the dated ones', () => {
  installNativeBoundary({ fs: true });
  const React = require('react');
  const rtl = requireRTL();
  const { useRecordings } = require('../../../src/atlasRecorder/store');
  const { useSchedule } = require('../../../src/schedule/store');
  const { RecordingDetailScreen } = require('../../../src/atlasRecorder/RecordingDetailScreen');
  useSchedule.setState({ tasks: [] });
  useRecordings.setState({
    recordings: [{
      id: 'rec1', title: 'Budget call', createdAt: new Date().toISOString(), durationSec: 60, audioPath: '/a.wav', status: 'done', labelled: true,
      speakerNames: { 0: 'Dana', 1: 'Lee' },
      utterances: [
        u(0, 0, 'Thanks for joining. I will send the revised budget by Friday.'),
        u(1, 10, 'Great. Can you book the meeting room for next week? Also the weather was nice.'),
        u(0, 20, 'Sure. We need to pick a vendor. Maybe I will think about it.'),
      ],
    }],
  });
  const view = rtl.render(React.createElement(RecordingDetailScreen));
  rtl.fireEvent.press(view.getByTestId('actions-find'));
  expect(view.getByText('Send the revised budget by Friday')).toBeTruthy();
  // Dana promised the budget, and Lee's "Can you book the room" falls to the other person, Dana too. Both have a day.
  expect(view.getAllByText(/^Dana · by /)).toHaveLength(2);
  expect(view.getByText('Book the meeting room for next week')).toBeTruthy();
  expect(view.getByText('Pick a vendor')).toBeTruthy();
  expect(view.getByText('Everyone · no day mentioned')).toBeTruthy();
  expect(view.getAllByTestId(/^action-a/)).toHaveLength(3); // the weather remark and the hedge ("maybe I will think about it") are not tasks

  rtl.fireEvent.press(view.getByTestId('actions-remind')); // the two with a day are ticked
  const tasks = useSchedule.getState().tasks;
  expect(tasks).toHaveLength(2);
  expect(tasks.map((t: { name: string }) => t.name).join('|')).toMatch(/Send the revised budget by Friday \(Dana\)/);
  expect(tasks.every((t: { repeat: string; onceAt: number }) => t.repeat === 'once' && t.onceAt > Date.now())).toBe(true);
  expect(view.getByText(/2 reminders set/)).toBeTruthy();
});
