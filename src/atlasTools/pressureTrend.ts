/**
 * Air pressure over time, read together with GPS height. Falling pressure at the same height means the weather is turning;
 * pressure that changes because you climbed is not weather. Pure, so it is tested without a device.
 * The thresholds are the usual barometer ones for the change over three hours. This is a guide, not a forecast.
 */
export interface PressureSample { at: number; hpa: number; /** GPS height in metres when there was a fix. */ gpsM?: number }

const HOUR = 3_600_000;
/** The standard atmosphere: height (m) from pressure (hPa), and the reverse. */
export const heightFromPressure = (hpa: number, seaLevelHpa = 1013.25): number => 44330 * (1 - (hpa / seaLevelHpa) ** (1 / 5.255));
export const seaLevelPressure = (hpa: number, heightM: number): number => hpa / (1 - heightM / 44330) ** 5.255;

export type TrendLabel = 'rising fast' | 'rising' | 'steady' | 'falling' | 'falling fast' | 'falling very fast';
export interface Trend {
  label: TrendLabel;
  /** Change over three hours, in hPa. Negative is falling. */
  change3h: number;
  /** True when GPS height was used to take your own climbing out of the change. */
  adjusted: boolean;
  /** Set when your height changed and there was no GPS to separate that from weather. */
  heightChanged: boolean;
  hint: string;
}

const MIN_SPAN = 0.75 * HOUR;
const WINDOW = 3 * HOUR;
const CLIMB_M = 15;

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const labelFor = (c: number): TrendLabel => {
  if (c <= -6) return 'falling very fast';
  if (c <= -3.6) return 'falling fast';
  if (c <= -1.6) return 'falling';
  if (c >= 3.6) return 'rising fast';
  if (c >= 1.6) return 'rising';
  return 'steady';
};

const HINTS: Record<TrendLabel, string> = {
  'falling very fast': 'Pressure is dropping very fast. A storm or strong wind is likely within hours.',
  'falling fast': 'Pressure is dropping fast. Rain or wind is likely soon.',
  falling: 'Pressure is falling. The weather may be turning, with rain or wind later.',
  steady: '',
  rising: 'Pressure is rising. The weather is likely to clear.',
  'rising fast': 'Pressure is rising fast. Clearer, windier weather is likely.',
};

/** The trend over the last three hours, or null when there is not enough history (under 45 minutes of readings). */
export function pressureTrend(samples: PressureSample[], now: number): Trend | null {
  const recent = samples.filter((s) => s.at >= now - WINDOW && s.at <= now && Number.isFinite(s.hpa)).sort((a, b) => a.at - b.at);
  if (recent.length < 2 || recent[recent.length - 1].at - recent[0].at < MIN_SPAN) return null;
  const head = recent.slice(0, Math.min(3, recent.length));
  const tail = recent.slice(-Math.min(3, recent.length));
  const gpsBoth = head.every((s) => s.gpsM !== undefined) && tail.every((s) => s.gpsM !== undefined);
  const climbed = gpsBoth ? Math.abs(average(tail.map((s) => s.gpsM!)) - average(head.map((s) => s.gpsM!))) > CLIMB_M : false;
  const read = (group: PressureSample[]) => (gpsBoth ? average(group.map((s) => seaLevelPressure(s.hpa, s.gpsM!))) : average(group.map((s) => s.hpa)));
  const span = average(tail.map((s) => s.at)) - average(head.map((s) => s.at));
  const change3h = ((read(tail) - read(head)) / span) * WINDOW;
  // Without GPS, a big change in the height the pressure alone implies could be you climbing, not weather.
  const pressureClimb = !gpsBoth && Math.abs(heightFromPressure(average(tail.map((s) => s.hpa))) - heightFromPressure(average(head.map((s) => s.hpa)))) > CLIMB_M * 3;
  const label = labelFor(change3h);
  return {
    label, change3h, adjusted: gpsBoth && climbed, heightChanged: pressureClimb,
    hint: pressureClimb ? 'The pressure changed by about as much as a climb would change it, and there is no GPS height to tell the two apart. Hold still and check again.' : HINTS[label],
  };
}
