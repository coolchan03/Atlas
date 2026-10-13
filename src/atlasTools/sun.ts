/**
 * Sunrise and sunset from GPS, fully offline (NOAA solar position equations,
 * accurate to about a minute away from the polar regions).
 */
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunTimes { sunrise: Date | null; sunset: Date | null; polar: 'day' | 'night' | null }

/** Times for the local calendar day of `date` at lat/lon (degrees, east positive). */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  // Day of year at UTC noon of the given local day.
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const n = Math.floor((day - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (n - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  // 90.833 degrees: refraction plus the sun's radius.
  const cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cosHa > 1) return { sunrise: null, sunset: null, polar: 'night' };
  if (cosHa < -1) return { sunrise: null, sunset: null, polar: 'day' };
  const ha = deg(Math.acos(cosHa));
  const midnightUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const riseMin = 720 - 4 * (lon + ha) - eqTime;
  const setMin = 720 - 4 * (lon - ha) - eqTime;
  return { sunrise: new Date(midnightUtc + riseMin * 60000), sunset: new Date(midnightUtc + setMin * 60000), polar: null };
}

/** "2 h 15 min" style duration. */
export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}
