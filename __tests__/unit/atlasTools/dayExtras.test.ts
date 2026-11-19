import { packForTomorrow, reviewsDueSpoken, specialDays, streakLine, weeklyDigest } from '../../../src/atlasTools/dayExtras';

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

describe('study streak and reviews due', () => {
  it('names the streak from three days on', () => {
    expect(streakLine(2)).toBe('');
    expect(streakLine(5)).toBe('You are on a 5-day study streak.');
  });
  it('counts due review cards and names the three busiest projects', () => {
    expect(reviewsDueSpoken([])).toBe('');
    expect(reviewsDueSpoken([{ project: 'FAR' }])).toBe('You have 1 review card due: 1 in FAR.');
    const due = [...Array(7).fill({ project: 'FAR' }), ...Array(5).fill({ project: 'REG' }), ...Array(2).fill({ project: 'AUD' }), { project: 'BEC' }];
    expect(reviewsDueSpoken(due)).toBe('You have 15 review cards due: 7 in FAR, 5 in REG and 2 in AUD.');
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
