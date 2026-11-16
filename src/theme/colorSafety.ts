/**
 * Colours that come from the person (an imported theme, a stored setting, one synced from elsewhere) are made safe before the app uses them.
 * The app adds see-through shades by writing two more digits after a colour (`${colors.primary}44`), which only works for a 6-digit hex
 * colour: "#abc", "#112233cc" or a stray word made an invalid colour, and a screen that drew with one could not draw at all.
 */
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX4 = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]$/i;
const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX8 = /^#([0-9a-f]{6})[0-9a-f]{2}$/i;

/** A plain 6-digit hex colour for `value` (short forms expanded, a see-through part dropped), or `fallback` when it is not a colour. */
export function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (HEX6.test(v)) return v;
  const short = HEX3.exec(v) ?? HEX4.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = HEX8.exec(v);
  return long ? `#${long[1]}` : fallback;
}

/** `color` with an opacity of `a` (0 to 1) as an rgba() colour; `color` itself when it is not a hex colour (so a see-through colour stays see-through). */
export function withAlpha(color: string, a: number): string {
  const hex = safeColor(color, '');
  if (!hex) return color;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

/**
 * The theme's colours with every value the appearance changed made safe: where the appearance gave something that is not a usable colour the
 * original colour stays. Values the appearance did not touch are left exactly as they are.
 */
export function sanitizeChanged<T>(colors: T, base: T): T {
  const out: Record<string, unknown> = { ...(colors as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    const was = (base as Record<string, unknown>)[key];
    if (out[key] !== was && typeof was === 'string' && /^#/.test(was)) out[key] = safeColor(out[key], was);
  }
  return out as T;
}
