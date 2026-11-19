import { calendarSpoken } from '../../src/atlasTools/calendarBrief';
import { weatherSpoken, type WeatherData } from '../../src/atlasTools/weather';
import { playEpisode } from '../../src/study/playEpisode';

const w: WeatherData = {
  tempMaxC: 20, tempMinC: 10, uvMax: 6, precipProbPct: 40, windKph: 30, code: 61, description: 'rain', uvWarning: 'High UV',
  tomorrow: { tempMaxC: 18, tempMinC: 8, uvMax: 2, description: 'partly cloudy' },
};

describe('spoken weather and calendar', () => {
  it('says the sky, temperatures, rain, wind and tomorrow', () => {
    const t = weatherSpoken(w, { imperial: false, temp: 'c' });
    expect(t).toMatch(/weather today is rain/);
    expect(t).toMatch(/40% chance of rain/);
    expect(t).toMatch(/Tomorrow looks partly cloudy/);
    expect(t).toMatch(/highest UV index today is 6, which is high/);
    expect(t).toMatch(/umbrella/);
  });

  it('gives friendly advice for cold and hot days', () => {
    const calm = { ...w, precipProbPct: 0 };
    expect(weatherSpoken({ ...calm, tempMaxC: 10 }, { imperial: false, temp: 'c' })).toMatch(/wear a sweater/);
    expect(weatherSpoken({ ...calm, tempMaxC: 35, uvMax: 1 }, { imperial: false, temp: 'c' })).toMatch(/turn up the AC.*\n?|no sun protection/);
  });

  it('reads the day\'s events with times, and nothing when the day is empty', () => {
    expect(calendarSpoken(null)).toBe('');
    expect(calendarSpoken({ flights: [], travelKeywords: [], eventTitles: [], today: [] })).toBe('');
    const t = calendarSpoken({
      flights: [], travelKeywords: [], eventTitles: [],
      today: [{ title: 'Dentist', start: new Date(2026, 10, 16, 9, 30) }, { title: 'Birthday', allDay: true }],
    });
    expect(t).toMatch(/^On your calendar today: Dentist at .*, and Birthday\.$/);
  });
});

describe('a quiet beat between stories', () => {
  it('chimes then waits before each story after the first, and not before the first', async () => {
    const log: string[] = [];
    await playEpisode({ count: 4, from: 0, tunes: { storyStarts: [2], pauseSeconds: 7 } }, {
      stopped: () => false,
      jingle: async (k) => { log.push(k); return true; },
      pause: async (s) => { log.push(`pause${s}`); return true; },
      onLine: (i) => log.push(`line${i}`),
      line: async () => true,
    });
    expect(log).toEqual(['intro', 'line0', 'line1', 'chime', 'pause7', 'line2', 'line3', 'outro']);
  });

  it('stops when playback is stopped during the pause', async () => {
    const log: string[] = [];
    const done = await playEpisode({ count: 4, from: 0, tunes: { storyStarts: [2], pauseSeconds: 7 } }, {
      stopped: () => false,
      jingle: async () => true,
      pause: async () => false,
      onLine: (i) => log.push(`line${i}`),
      line: async () => true,
    });
    expect(done).toBe(false);
    expect(log).toEqual(['line0', 'line1']);
  });
});

describe('the opening and closing tunes', () => {
  const run = async (from: number, tunes: any) => {
    const log: string[] = [];
    await playEpisode({ count: 3, from, tunes }, { stopped: () => false, jingle: async (k) => { log.push(k); return true; }, onLine: (i) => log.push(`line${i}`), line: async () => true });
    return log;
  };
  it('plays the opening tune from the start, and the closing tune when the show ends', async () => {
    expect(await run(0, { storyStarts: [] })).toEqual(['intro', 'line0', 'line1', 'line2', 'outro']);
  });
  it('plays the opening tune when carrying on from where you left off, if asked, and not when skipping within the show', async () => {
    expect(await run(2, { storyStarts: [], intro: true })).toEqual(['intro', 'line2', 'outro']);
    expect(await run(2, { storyStarts: [], intro: false })).toEqual(['line2', 'outro']);
    expect(await run(2, { storyStarts: [] })).toEqual(['line2', 'outro']);
  });

  it('reads tomorrow\'s events in the evening, with birthdays first', () => {
    const ctx = { flights: [], travelKeywords: [], eventTitles: [], today: [{ title: 'Today thing' }], tomorrow: [{ title: "Jo's birthday", allDay: true }, { title: 'Dentist', start: new Date(2026, 10, 20, 9, 30) }] };
    const said = calendarSpoken(ctx, { day: 'tomorrow' });
    expect(said).toMatch(/^Tomorrow is Jo's birthday\. On your calendar tomorrow: Dentist at .*\.$/);
    expect(said).not.toContain('Today thing');
    expect(calendarSpoken({ ...ctx, tomorrow: [] }, { day: 'tomorrow' })).toBe('');
  });
});
