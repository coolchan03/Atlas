import { addDailyReminder, dailyRule } from '../../src/atlasTools/deviceTools';

it('makes a daily rule that ends on the exam day', () => {
  expect(dailyRule()).toBe('FREQ=DAILY');
  expect(dailyRule('2026-12-20')).toBe('FREQ=DAILY;UNTIL=20261220T235959Z');
  expect(dailyRule('not a date')).toBe('FREQ=DAILY');
});

it('opens the calendar with a 19:00 daily event that is not in the past', async () => {
  const open = jest.fn().mockResolvedValue(true);
  jest.resetModules();
  (require('react-native').NativeModules as any).AtlasDevice = { addRepeatingCalendarEvent: open };
  const { addDailyReminder: fresh } = require('../../src/atlasTools/deviceTools');
  await fresh('Study', { until: '2026-12-20' });
  const [title, start, end, rule] = open.mock.calls[0];
  expect(title).toBe('Study');
  expect(new Date(start).getHours()).toBe(19);
  expect(start).toBeGreaterThan(Date.now());
  expect(end - start).toBe(30 * 60000);
  expect(rule).toContain('UNTIL=20261220');
  expect(typeof addDailyReminder).toBe('function');
});
