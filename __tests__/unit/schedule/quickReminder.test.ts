import { parseReminder } from '../../../src/schedule/quickReminder';

// Thursday 19 Nov 2026, 14:30
const NOW = new Date(2026, 10, 19, 14, 30).getTime();
const when = (ms?: number) => (ms === undefined ? '' : new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
const ok = (text: string, now = NOW) => { const r = parseReminder(text, now); if (!r.ok) throw new Error(r.error); return r.reminder; };

describe('a reminder from one sentence', () => {
  it('reads tomorrow at a time', () => {
    const r = ok('remind me to call Mom tomorrow at 9am');
    expect(r).toMatchObject({ text: 'call Mom', repeat: 'once', hour: 9, minute: 0 });
    expect(when(r.onceAt)).toBe('Fri 20, 09:00');
  });
  it('reads "in N minutes/hours/days"', () => {
    expect(when(ok('remind me in 20 minutes to check the oven').onceAt)).toBe('Thu 19, 14:50');
    expect(ok('check the oven in 20 minutes').text).toBe('check the oven');
    expect(when(ok('remind me to stretch in 2 hours').onceAt)).toBe('Thu 19, 16:30');
    expect(when(ok('pay rent in 3 days').onceAt)).toBe('Sun 22, 14:30');
  });
  it('reads repeats: daily, weekdays and a named weekday', () => {
    expect(ok('remind me every day at 7:30am to read the news')).toMatchObject({ repeat: 'daily', hour: 7, minute: 30, text: 'read the news' });
    expect(ok('stretch every weekday at 8')).toMatchObject({ repeat: 'weekdays', hour: 8, text: 'stretch' });
    expect(ok('water the plants every Monday at 6pm')).toMatchObject({ repeat: 'weekly', weekday: 1, hour: 18, text: 'water the plants' });
  });
  it('reads a named day, and a time that has passed today means tomorrow', () => {
    expect(when(ok('dentist on friday at 3pm').onceAt)).toBe('Fri 20, 15:00');
    expect(when(ok('call the bank at 9').onceAt)).toBe('Fri 20, 09:00'); // 9 am has passed today
    expect(when(ok('call the bank on thursday at 9am').onceAt)).toBe('Thu 26, 09:00'); // a named day that passed today means next week
    expect(when(ok('take out the trash tonight').onceAt)).toBe('Thu 19, 20:00');
    expect(when(ok('remind me to run tomorrow morning').onceAt)).toBe('Fri 20, 09:00');
  });
  it('asks for what is missing', () => {
    expect(parseReminder('', NOW)).toMatchObject({ ok: false });
    expect(parseReminder('call Mom', NOW)).toMatchObject({ ok: false, error: expect.stringContaining('time') });
    expect(parseReminder('tomorrow at 9am', NOW)).toMatchObject({ ok: false, error: expect.stringContaining('what') });
    expect(parseReminder('x at 25:00', NOW)).toMatchObject({ ok: false });
  });

  it('reads "tonight at 10" and "tomorrow evening at 6" as evening times, not morning ones', () => {
    const night = new Date(2026, 10, 19, 21, 0).getTime();
    const r = ok('remind me to lock up tonight at 10', night);
    expect(r.hour).toBe(22);
    expect(when(r.onceAt)).toBe('Thu 19, 22:00');
    expect(ok('call Sam tomorrow evening at 6', night).hour).toBe(18);
    expect(ok('call Sam this afternoon at 3', NOW - 6 * 36e5).hour).toBe(15);
    expect(ok('lock up tonight at 10pm', night).hour).toBe(22);
    expect(ok('run tomorrow morning at 7', night).hour).toBe(7);
  });
});
