/**
 * Weather and UV forecast from Open-Meteo (free, no API key).
 * https://open-meteo.com/
 */

import { fmtTemp, fmtWind, type Units } from './units';

export interface WeatherData {
  tempMaxC: number;
  tempMinC: number;
  uvMax: number;
  precipProbPct: number;
  windKph: number;
  code: number;
  description: string;
  uvWarning: string;
  /** Tomorrow's data when available. */
  tomorrow?: { tempMaxC: number; tempMinC: number; uvMax: number; description: string };
}

export function wmoDescription(code: number): string {
  if (code === 0) return 'clear sky';
  if (code === 1) return 'mainly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code <= 48) return 'foggy';
  if (code <= 55) return 'drizzle';
  if (code <= 65) return 'rain';
  if (code <= 67) return 'freezing rain';
  if (code <= 75) return 'snow';
  if (code <= 77) return 'snow grains';
  if (code <= 82) return 'rain showers';
  if (code <= 86) return 'snow showers';
  if (code === 95) return 'thunderstorm';
  return 'severe thunderstorm';
}

function uvWarning(uv: number): string {
  if (uv < 3) return 'Low UV';
  if (uv < 6) return 'Moderate UV';
  if (uv < 8) return 'High UV';
  if (uv < 11) return 'Very high UV';
  return 'Extreme UV';
}

/** UV protection advice in one sentence. */
export function uvAdvice(uv: number): string {
  if (uv < 3) return 'No protection needed.';
  if (uv < 6) return 'Wear sunscreen.';
  if (uv < 8) return 'Sunscreen and sunglasses; seek shade midday.';
  if (uv < 11) return 'Avoid midday sun; sunscreen and a hat required.';
  return 'Stay indoors midday; maximum protection if you go out.';
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,windspeed_10m_max` +
      `&timezone=auto&forecast_days=2`;
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return null;
    const json = await r.json();
    const d = json.daily;
    if (!d?.weathercode?.length) return null;
    const code = d.weathercode[0] ?? 0;
    const uv = d.uv_index_max[0] ?? 0;
    const tmCode = d.weathercode[1];
    const tmUv = d.uv_index_max[1] ?? 0;
    return {
      tempMaxC: Math.round(d.temperature_2m_max[0] ?? 20),
      tempMinC: Math.round(d.temperature_2m_min[0] ?? 10),
      uvMax: Math.round(uv * 10) / 10,
      precipProbPct: d.precipitation_probability_max[0] ?? 0,
      windKph: Math.round(d.windspeed_10m_max[0] ?? 0),
      code,
      description: wmoDescription(code),
      uvWarning: uvWarning(uv),
      tomorrow: tmCode != null ? {
        tempMaxC: Math.round(d.temperature_2m_max[1] ?? 20),
        tempMinC: Math.round(d.temperature_2m_min[1] ?? 10),
        uvMax: Math.round(tmUv * 10) / 10,
        description: wmoDescription(tmCode),
      } : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** One-line weather summary for the AI briefing context, in the person's units. */
export function weatherSummary(w: WeatherData, cityName?: string, units: Units = { imperial: false, temp: 'c' }): string {
  const loc = cityName ? ` in ${cityName}` : '';
  const parts = [
    `Today${loc}: ${w.description}`,
    `high ${fmtTemp(w.tempMaxC, units.temp)} / low ${fmtTemp(w.tempMinC, units.temp)}`,
    `UV max ${w.uvMax} (${w.uvWarning.toLowerCase()})`,
    w.precipProbPct > 10 ? `${w.precipProbPct}% chance of rain` : null,
    w.windKph > 20 ? `wind up to ${fmtWind(w.windKph, units.imperial)}` : null,
  ].filter(Boolean).join(', ');
  return `${parts}.`;
}
