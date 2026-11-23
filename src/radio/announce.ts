/**
 * What the host says between songs. These are written lines with the show's dice dropped in, not model output: the host never rambles,
 * never invents a fact, and costs nothing to make. The voice is the phone's own, read in one steady tone.
 */
import { describeShow, type Random, type Show } from './dice';

const pick = <T>(list: readonly T[], rng: Random): T => list[Math.floor(rng() * list.length) % list.length];
const article = (s: string): string => (/^[aeiou]/i.test(s) ? 'an' : 'a');

export function stationId(name: string, theme: string, rng: Random): string {
  const about = theme.trim() ? ` ${pick(['The station for', 'Tonight', 'All about'], rng)} ${theme.trim().replace(/[.!?]+$/, '')}.` : '';
  return `${pick(['You are listening to', 'This is', 'Welcome back to'], rng)} ${name}.${about}`;
}

/** The line before a song: what is coming, in the host's words. */
export function nextUp(show: Show, rng: Random): string {
  const kind = `${article(show.tone)} ${describeShow(show)}`;
  const poem = show.withPoem ? ' A poem comes with it.' : '';
  return `${pick(['Up next,', 'Coming up,', 'Next on the station,'], rng)} ${kind}.${poem}`;
}
