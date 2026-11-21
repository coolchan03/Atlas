/** Sensor-derived tilt of the device face relative to level, in degrees.
 * Returns null while unavailable rather than pretending the phone is level.
 */
export interface LevelReading { pitch: number; roll: number; tilt: number; isLevel: boolean; }
export function levelReading(o: { pitch: number; roll: number } | null | undefined): LevelReading | null {
  if (!o || !Number.isFinite(o.pitch) || !Number.isFinite(o.roll)) return null;
  const tilt = Math.hypot(o.pitch, o.roll);
  return { pitch: o.pitch, roll: o.roll, tilt, isLevel: tilt <= 1 };
}
export function clampLevelMarker(v: number): number {
  return Math.max(-90, Math.min(90, v * 3));
}

export interface LevelPose {
  /** Lying flat: two circles that sit on top of each other when level. Upright: two circles that line up when square to the ground. */
  mode: 'flat' | 'upright';
  /** Degrees away from level (flat) or from the nearest quarter turn, 0 / 90 / 180 / 270 (upright). Signed. */
  degrees: number;
  isLevel: boolean;
  /** How far the moving circle sits from the fixed one, in degrees, on each axis. */
  x: number;
  y: number;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const FLAT_SHARE = 0.85; // the share of gravity on the screen's normal above which the phone counts as lying flat
const LEVEL_WITHIN = 1;

/**
 * What the level should show from the accelerometer (gravity on x right, y up, z out of the screen) and, when there is
 * one, the orientation sensor. Lying flat it is a bubble level. Held upright it measures the turn of the phone in its own
 * plane, like the old iOS level: square to the ground at 0, 90, 180 and 270 degrees, and the circles line up there.
 */
export function levelPose(
  accel: { x: number; y: number; z: number } | null | undefined,
  orientation?: { pitch: number; roll: number } | null,
): LevelPose | null {
  const flatFrom = (x: number, y: number): LevelPose => ({ mode: 'flat', degrees: Math.hypot(x, y), isLevel: Math.hypot(x, y) <= LEVEL_WITHIN, x, y });
  const finite = !!accel && [accel.x, accel.y, accel.z].every(Number.isFinite);
  const norm = finite ? Math.hypot(accel!.x, accel!.y, accel!.z) : 0;
  if (!finite || norm < 1e-6) {
    const o = levelReading(orientation);
    return o ? flatFrom(o.roll, o.pitch) : null;
  }
  const { x, y, z } = accel!;
  if (Math.abs(z) / norm >= FLAT_SHARE) {
    const o = levelReading(orientation);
    return o ? flatFrom(o.roll, o.pitch) : flatFrom(deg(Math.asin(Math.max(-1, Math.min(1, x / norm)))), deg(Math.asin(Math.max(-1, Math.min(1, y / norm)))));
  }
  const turn = deg(Math.atan2(x, y)); // 0 when upright in portrait
  const off = turn - 90 * Math.round(turn / 90);
  return { mode: 'upright', degrees: off, isLevel: Math.abs(off) <= LEVEL_WITHIN, x: off, y: 0 };
}
