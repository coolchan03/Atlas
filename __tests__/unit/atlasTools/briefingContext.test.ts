import { calendarSummary, parseFlight } from '../../../src/atlasTools/calendarBrief';
import { fetchWeather, uvAdvice, weatherSummary, wmoDescription, type WeatherData } from '../../../src/atlasTools/weather';

describe('finding a flight in a calendar event', () => {
  it('reads a known airline and number, the destination and the time', () => {
    const f = parseFlight('UA 482 to San Francisco', '2026-11-12T15:30:00Z');
    expect(f).toMatchObject({ raw: 'UA482', airline: 'United', number: '482', destination: 'San Francisco' });
    expect(f?.departureTime?.toISOString()).toBe('2026-11-12T15:30:00.000Z');
  });

  it('does not mistake other titles for flights', () => {
    for (const title of ['Review PR 42', 'AI 2024 roadmap', 'OK 12 items', 'Dentist at 3pm']) expect(parseFlight(title, '')).toBeNull();
  });

  it('accepts an unfamiliar airline code only when the title is about travel', () => {
    expect(parseFlight('Flight XY 123 to Lisbon', '')).toMatchObject({ raw: 'XY123' });
    expect(parseFlight('XY 123', '')).toBeNull();
  });

  it('writes a short sentence for the briefing, and nothing when there is nothing', () => {
    const flight = parseFlight('DL 15 to Tokyo', '2026-11-12T08:00:00Z')!;
    expect(calendarSummary({ flights: [flight], travelKeywords: [], eventTitles: [] })).toMatch(/^Today: flight DL15 \(Delta\)/);
    expect(calendarSummary({ flights: [], travelKeywords: ['Lisbon', 'Conference'], eventTitles: [] })).toBe('Today: travel plans involving Lisbon, Conference.');
    expect(calendarSummary({ flights: [], travelKeywords: [], eventTitles: [] })).toBe('');
  });
});

describe('weather for the briefing', () => {
  const forecast = {
    daily: {
      weathercode: [61, 71], temperature_2m_max: [14.6, 2], temperature_2m_min: [7.2, -3], uv_index_max: [2.44, 1],
      precipitation_probability_max: [80, 20], windspeed_10m_max: [26.4, 5],
    },
  };
  const respond = (body: unknown, ok = true) => { (global as any).fetch = jest.fn(async () => ({ ok, json: async () => body })); };

  it('turns the forecast into rounded numbers and words, and asks only for coordinates to four places', async () => {
    respond(forecast);
    const w = await fetchWeather(51.50735, -0.12776);
    expect(w).toMatchObject({ tempMaxC: 15, tempMinC: 7, uvMax: 2.4, precipProbPct: 80, windKph: 26, description: 'rain', uvWarning: 'Low UV' });
    expect(w?.tomorrow).toMatchObject({ description: 'snow', tempMinC: -3 });
    expect((global as any).fetch.mock.calls[0][0]).toContain('latitude=51.5074&longitude=-0.1278');
  });

  it('gives nothing, rather than a made-up forecast, when the service fails or answers oddly', async () => {
    respond({}, false);
    expect(await fetchWeather(1, 1)).toBeNull();
    respond({ daily: { weathercode: [] } });
    expect(await fetchWeather(1, 1)).toBeNull();
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    expect(await fetchWeather(1, 1)).toBeNull();
  });

  it('describes freezing rain as freezing rain, not snow', () => {
    expect([wmoDescription(0), wmoDescription(53), wmoDescription(66), wmoDescription(73), wmoDescription(95)]).toEqual(['clear sky', 'drizzle', 'freezing rain', 'snow', 'thunderstorm']);
  });

  it('summarises the day in one line and advises on UV', () => {
    const w = { tempMaxC: 15, tempMinC: 7, uvMax: 2.4, precipProbPct: 80, windKph: 26, code: 61, description: 'rain', uvWarning: 'Low UV' } as WeatherData;
    expect(weatherSummary(w, 'London')).toBe('Today in London: rain, high 15°C / low 7°C, UV max 2.4 (low uv), 80% chance of rain, wind up to 26 km/h.');
    expect([uvAdvice(1), uvAdvice(5), uvAdvice(12)]).toEqual(['No protection needed.', 'Wear sunscreen.', 'Stay indoors midday; maximum protection if you go out.']);
  });
});
