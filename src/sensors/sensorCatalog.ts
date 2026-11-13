/**
 * What each Android sensor type is called, what its numbers mean and how to show them. Pure, so it is tested without a
 * device. A sensor type this list does not know is still shown, under the name the phone gives it.
 */
import { fmtTemp, type Units } from '../atlasTools/units';

export interface SensorInfo { label: string; hint: string; show: (v: number[], units: Units) => string }

const fixed = (n: number | undefined, digits = 1): string => (Number.isFinite(n) ? (n as number).toFixed(digits) : '-');
const triple = (v: number[], unit: string, digits = 2): string => `x ${fixed(v[0], digits)}  y ${fixed(v[1], digits)}  z ${fixed(v[2], digits)} ${unit}`;

export const SENSOR_INFO: Record<number, SensorInfo> = {
  1: { label: 'Accelerometer', hint: 'Movement and tilt, including gravity', show: (v) => triple(v, 'm/s²') },
  2: { label: 'Magnetometer', hint: 'Magnetic field, what the compass and metal detector read', show: (v) => `${fixed(Math.hypot(v[0], v[1], v[2]))} µT` },
  4: { label: 'Gyroscope', hint: 'How fast the phone is turning', show: (v) => triple(v, 'rad/s') },
  5: { label: 'Light', hint: 'Brightness around the phone', show: (v) => `${fixed(v[0], 0)} lux` },
  6: { label: 'Air pressure', hint: 'Barometer: weather and height', show: (v) => `${fixed(v[0])} hPa` },
  8: { label: 'Proximity', hint: 'Whether something is close to the screen', show: (v) => (v[0] === 0 ? 'Near' : 'Far') },
  9: { label: 'Gravity', hint: 'The pull of gravity alone', show: (v) => triple(v, 'm/s²') },
  10: { label: 'Linear acceleration', hint: 'Movement with gravity taken out', show: (v) => triple(v, 'm/s²') },
  11: { label: 'Rotation vector', hint: 'Which way the phone faces', show: (v) => triple(v, '', 3) },
  12: { label: 'Humidity', hint: 'Moisture in the air', show: (v) => `${fixed(v[0], 0)} %` },
  13: { label: 'Air temperature', hint: 'Temperature around the phone', show: (v, units) => fmtTemp(v[0], units.temp) },
  15: { label: 'Game rotation', hint: 'Turning, without the compass', show: (v) => triple(v, '', 3) },
  17: { label: 'Significant motion', hint: 'Fires when you start to walk, drive or similar', show: () => 'Waiting for movement' },
  18: { label: 'Step detector', hint: 'One tick per step', show: () => 'Counts each step' },
  19: { label: 'Step counter', hint: 'Steps since the phone started (needs Physical activity permission)', show: (v) => `${fixed(v[0], 0)} steps` },
  20: { label: 'Geomagnetic rotation', hint: 'Which way the phone faces, from the magnetometer', show: (v) => triple(v, '', 3) },
  30: { label: 'Motion detect', hint: 'Whether the phone is moving', show: (v) => (v[0] ? 'Moving' : 'Still') },
  29: { label: 'Stationary detect', hint: 'Whether the phone has been still for a while', show: (v) => (v[0] ? 'Still' : 'Moving') },
};

/** Sensors that need a permission Atlas does not ask for here: they are listed but not read. */
export const NEEDS_PERMISSION = new Set([21, 31, 34, 35]);

export interface ListedSensor { type: number; name: string; vendor?: string; stringType?: string; maxRange?: number; resolution?: number }

/** One entry per sensor type, in a steady order: the ones this list knows first, then the rest by name. */
export function uniqueSensors(list: ListedSensor[]): ListedSensor[] {
  const seen = new Set<number>();
  const unique = list.filter((s) => (seen.has(s.type) ? false : (seen.add(s.type), true)));
  return unique.sort((a, b) => Number(!(a.type in SENSOR_INFO)) - Number(!(b.type in SENSOR_INFO)) || a.type - b.type);
}

export const labelOf = (s: ListedSensor): string => SENSOR_INFO[s.type]?.label ?? (s.stringType?.split('.').pop()?.replace(/_/g, ' ') || s.name);
