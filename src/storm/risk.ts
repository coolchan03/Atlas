/**
 * Storm risk from the pressure log. The level is decided here, in code, from how far the pressure has fallen over three hours and
 * over the last hour. The AI only explains the level in plain words (narrate.ts); it never picks it. A guide, not a forecast.
 */
import { pressureTrend, seaLevelPressure, type PressureSample, type Trend } from '../atlasTools/pressureTrend';

export type StormLevel = 'learning' | 'unclear' | 'calm' | 'watch' | 'warning' | 'storm';

export interface StormRisk {
  level: StormLevel;
  /** Change over 3 hours in hPa (negative is falling), or null while there is too little history. */
  change3h: number | null;
  /** Change over the last hour in hPa, or null when there are no readings spanning 40 minutes of it. */
  change1h: number | null;
  /** Latest pressure reduced to sea level when GPS height is known, else as read. */
  hpa: number | null;
  trend: Trend | null;
  /** What to do, in a fixed sentence per level. */
  advice: string;
}

const HOUR = 3_600_000;
export const LEVEL_NAME: Record<StormLevel, string> = {
  learning: 'Learning', unclear: 'Unclear', calm: 'Calm', watch: 'Watch', warning: 'Warning', storm: 'Storm likely',
};
export const ADVICE: Record<StormLevel, string> = {
  learning: 'Not enough readings yet. Keep this screen open for about 45 minutes, or come back during the day.',
  unclear: 'Your height changed as much as the pressure did, so the two cannot be told apart. Stay at one height for a while and check again.',
  calm: 'No sign of a storm in the pressure. Check again in a few hours.',
  watch: 'The pressure is falling. Weather may turn within the day. Keep an eye on the sky and check again in an hour.',
  warning: 'The pressure is falling fast. Rain or wind is likely within a few hours. Finish exposed plans and have shelter and warm layers close.',
  storm: 'The pressure is dropping very fast. A storm or strong wind is likely within hours. Get to shelter and leave high or open ground.',
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Pressure at sea level for a sample when it has a GPS height. */
const level0 = (s: PressureSample): number => (s.gpsM === undefined ? s.hpa : seaLevelPressure(s.hpa, s.gpsM));

/** The change over the last hour from the first and last few readings of it, or null when they span under 40 minutes. */
function changeLastHour(samples: PressureSample[], now: number): number | null {
  const recent = samples.filter((s) => s.at >= now - HOUR && s.at <= now && Number.isFinite(s.hpa)).sort((a, b) => a.at - b.at);
  if (recent.length < 2 || recent[recent.length - 1].at - recent[0].at < 40 * 60_000) return null;
  const head = recent.slice(0, 2); const tail = recent.slice(-2);
  const span = mean(tail.map((s) => s.at)) - mean(head.map((s) => s.at));
  return span <= 0 ? null : ((mean(tail.map(level0)) - mean(head.map(level0))) / span) * HOUR;
}

/** Decides the level. Pure. */
export function stormRisk(samples: PressureSample[], now: number): StormRisk {
  const trend = pressureTrend(samples, now);
  const latest = [...samples].filter((s) => s.at <= now).sort((a, b) => b.at - a.at)[0];
  const hpa = latest ? Math.round(level0(latest) * 10) / 10 : null;
  const change1h = changeLastHour(samples, now);
  const make = (level: StormLevel): StormRisk => ({ level, change3h: trend?.change3h ?? null, change1h, hpa, trend, advice: ADVICE[level] });
  if (!trend) return make('learning');
  if (trend.heightChanged) return make('unclear');
  const c3 = trend.change3h; const c1 = change1h ?? 0;
  if (c3 <= -6 || c1 <= -3) return make('storm');
  // Already low and still falling counts one step worse.
  const low = hpa !== null && hpa < 1000;
  if (c3 <= -3.6 || c1 <= -2 || (low && c3 <= -1.6)) return make('warning');
  if (c3 <= -1.6) return make('watch');
  return make('calm');
}
