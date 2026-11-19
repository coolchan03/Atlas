import { lastWorkedOn, packForTomorrow, specialDays, streakSpoken, studyStreak, weeklyDigest } from '../../../src/atlasTools/dayExtras';

const C = { imperial: false, temp: 'c' as const };
const F = { imperial: true, temp: 'f' as const };
const evening = 19; const morning = 8;
const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
const DAY = 864e5;

describe('pack for tomorrow', () => {
  it('names an umbrella for rain and a jacket for a big drop, in the evening only', () => {
    const today = { tempMaxC: 24, description: 'clear' };
    expect(packForTomorrow({ today, tomorrow: { tempMaxC: 22, precipProbPct: 70, description: 'rain' }, units: C, hour: evening })).toBe('Pack for tomorrow: an umbrella.');
    expect(packForTomorrow({ today, tomorrow: { tempMaxC: 14, precipProbPct: 10, description: 'clear' }, units: C, hour: evening })).toBe('Pack for tomorrow: a warmer jacket (it will be 10 degrees colder).');
    expect(packForTomorrow({ today, tomorrow: { tempMaxC: 12, precipProbPct: 80, description: 'rain showers' }, units: F, hour: evening })).toBe('Pack for tomorrow: an umbrella and a warmer jacket (it will be 22 degrees colder).');
    expect(packForTomorrow({ today, tomorrow: { tempMaxC: 12, precipProbPct: 80, description: 'rain' }, units: C, hour: morning })).toBe('');
    expect(packForTomorrow({ today, tomorrow: { tempMaxC: 23, precipProbPct: 10, description: 'clear' }, units: C, hour: evening })).toBe('');
    expect(packForTomorrow({ today, units: C, hour: evening })).toBe('');
  });
});

describe('birthdays and anniversaries', () => {
  it('says them first and leaves the other events to be listed', () => {
    expect(specialDays(["Sam's birthday", 'Dentist', 'Anniversary: Jo']).said).toBe("Today is Sam's birthday and Jo's anniversary.");
    expect(specialDays(["Sam's birthday", 'Dentist']).rest).toEqual(['Dentist']);
    expect(specialDays(['Dentist'])).toEqual({ said: '', rest: ['Dentist'] });
    expect(specialDays(['Birthday'])).toEqual({ said: '', rest: ['Birthday'] }); // whose? stays an ordinary event
  });
});

describe('study streak', () => {
  const now = noon(2026, 10, 19);
  it('counts days in a row ending today or yesterday', () => {
    expect(studyStreak([now, now - DAY, now - 2 * DAY], now)).toEqual({ days: 3, today: true });
    expect(studyStreak([now - DAY, now - 2 * DAY], now)).toEqual({ days: 2, today: false });
    expect(studyStreak([now - 2 * DAY], now).days).toBe(0);
    expect(studyStreak([now, now - 2 * DAY], now).days).toBe(1);
  });
  it('speaks only from three days on', () => {
    expect(streakSpoken([now, now - DAY], now)).toBe('');
    expect(streakSpoken([now, now - DAY, now - 2 * DAY, now - 3 * DAY], now)).toBe('You have worked on study material 4 days in a row.');
  });
});

describe('weekly digest', () => {
  const monday = noon(2026, 10, 16); // a Monday
  const items = [{ at: monday - DAY, project: 'FAR' }, { at: monday - 2 * DAY, project: 'FAR' }, { at: monday - 3 * DAY, project: 'REG' }, { at: monday - 20 * DAY, project: 'AUD' }];
  it('speaks on Mondays about the last 7 days only', () => {
    expect(new Date(monday).getDay()).toBe(1);
    expect(weeklyDigest(items, monday)).toBe('Last week you made 3 study items on 3 days, most of them in FAR (2).');
    expect(weeklyDigest(items, monday + DAY)).toBe('');
    expect(weeklyDigest([], monday)).toBe('');
    expect(weeklyDigest([{ at: monday - DAY, project: 'FAR' }], monday)).toBe('Last week you made 1 study item on 1 day in FAR.');
  });
});

describe('where you were last', () => {
  const now = noon(2026, 10, 19);
  const chat = (title: string, agoDays: number, messages = 2) => ({ title, updatedAt: new Date(now - agoDays * DAY).toISOString(), messages });
  it('names the newest chat from the last 3 days that has messages', () => {
    expect(lastWorkedOn([chat('Old', 2), chat('Leases', 0.5), chat('Empty', 0.1, 0)], now)).toBe('Last time you were working on Leases.');
    expect(lastWorkedOn([chat('Stale', 5)], now)).toBe('');
    expect(lastWorkedOn([], now)).toBe('');
  });
});
