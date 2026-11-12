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
