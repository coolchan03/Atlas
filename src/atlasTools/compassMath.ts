/** True heading from a magnetic heading and the local declination (east positive). */
export function trueHeading(magnetic: number, declination: number | null): number {
  const d = declination !== null && Number.isFinite(declination) ? declination : 0;
  return (((magnetic + d) % 360) + 360) % 360;
}
