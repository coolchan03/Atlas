/**
 * What the host says between songs. These are written lines with the show's dice dropped in, not model output: the host never rambles,
 * never invents a fact, and costs nothing to make. The voice is the phone's own, read in one steady tone.
 */
import { describeShow, type Random, type Show } from './dice';

const pick = <T>(list: readonly T[], rng: Random): T => list[Math.floor(rng() * list.length) % list.length];
const article = (s: string): string => (/^[aeiou]/i.test(s) ? 'an' : 'a');

/** The station's name said the way a radio does, different each time. */
function stationId(name: string, theme: string, rng: Random): string {
  const about = theme.trim() ? ` ${pick(['The station for', 'Tonight', 'All about'], rng)} ${theme.trim().replace(/[.!?]+$/, '')}.` : '';
  return `${pick(['You are listening to', 'This is', 'You are tuned in to', 'Welcome back to', 'Stay tuned to', 'Here on'], rng)} ${name}.${about}`;
}

/** The line before a song: what is coming, in the host's words. */
function nextUp(show: Show, rng: Random): string {
  const kind = `${article(show.tone)} ${describeShow(show)}`;
  const poem = show.withPoem ? ' A poem comes with it.' : '';
  return `${pick(['Up next,', 'Coming up,', 'Next on the station,'], rng)} ${kind}.${poem}`;
}

/** The time of day as a host says it ("It is 9:41 PM."). */
export function timeCheck(now: Date): string {
  const h = now.getHours();
  return `It is ${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}.`;
}

/**
 * Everything the host says in a break: what the song that just ended was, the station's name, now and then the time, and what comes next.
 * "That was a calm jazz song about the moon. This is AI FM. Up next, a silly punk song about revenge." The theme is added to the name only
 * when `withTheme` is true, so the station's pitch is not repeated every break. Written lines, never model output.
 */
export function breakLine(o: { previous?: Show; next: Show; name: string; theme: string; withTheme: boolean; now: Date }, rng: Random): string {
  const parts: string[] = [];
  if (o.previous) parts.push(`${pick(['That was', 'You just heard', 'That was'], rng)} ${article(o.previous.tone)} ${describeShow(o.previous)}.`);
  parts.push(stationId(o.name.trim() || 'AI FM', o.withTheme ? o.theme : '', rng));
  if (rng() < 0.25) parts.push(timeCheck(o.now));
  parts.push(nextUp(o.next, rng));
  return parts.join(' ');
}
