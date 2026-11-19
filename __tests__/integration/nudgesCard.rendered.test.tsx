/** Settings has a switch for every reminder, tip, notice and extra briefing line, and the switches really change what is shown or said. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

it('switches a reminder and a briefing line off from Settings, and the app stops showing and saying them', () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { NudgesCard } = require('../../src/components/NudgesCard');
  const { BackupReminderCard } = require('../../src/components/BackupReminderCard');
  const { useBackupReminder } = require('../../src/atlasTools/backupReminder');
  const { calendarSpoken } = require('../../src/atlasTools/calendarBrief');
  const { nudgeOn, NUDGES, useNudges } = require('../../src/atlasTools/nudges');
  useBackupReminder.setState({ since: Date.now() - 30 * 864e5, lastBackupAt: null, snoozedUntil: 0 });

  // One screen holds both, as the real app does.
  const card = rtl.render(React.createElement(React.Fragment, null, React.createElement(NudgesCard), React.createElement(BackupReminderCard, { onOpenSettings: jest.fn() })));
  const reminder = card;
  for (const n of NUDGES) { expect(card.getByTestId(`nudge-${n.id}`)).toBeTruthy(); expect(useNudges.getState()[n.id]).toBe(true); }
  expect(reminder.queryByTestId('backup-reminder')).not.toBeNull();
  const today = [{ title: "Sam's birthday", allDay: true }, { title: 'Dentist', allDay: true }];
  expect(calendarSpoken({ today } as never, { birthdays: nudgeOn('birthdays') })).toContain("Today is Sam's birthday.");

  rtl.fireEvent(card.getByTestId('nudge-backupReminder'), 'valueChange', false);
  rtl.fireEvent(card.getByTestId('nudge-birthdays'), 'valueChange', false);
  expect(useNudges.getState().backupReminder).toBe(false);
  expect(useNudges.getState().speedTips).toBe(true); // the others are untouched
  expect(reminder.queryByTestId('backup-reminder')).toBeNull();
  const spoken = calendarSpoken({ today } as never, { birthdays: nudgeOn('birthdays') });
  expect(spoken).not.toContain('Today is');
  expect(spoken).toContain("Sam's birthday");
});
