/**
 * The journal page for a walk. The facts (distance, time, climbing) are written in code from the recorded route; the AI adds a few
 * sentences of story from them and your own note. Sentences with a number that is not in the facts are thrown away, so the page
 * never states a distance or a height the route does not show.
 */
import { askShaped } from '../study/engine';
import { fmtDistance } from '../atlasMaps/maps';
import type { TrailStats } from './geometry';

const SYSTEM = `You write a short first-person trail journal entry (3 to 4 sentences) from the facts of a walk and the walker's own note. Be plain and specific. Use only the facts and the note: do not invent places, weather, animals, people or numbers.`;

const minutes = (ms: number) => Math.round(ms / 60_000);
const hm = (ms: number) => { const m = minutes(ms); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

/** The facts of a walk as sentences, from the numbers. Pure. */
function trailFacts(name: string, s: TrailStats, imperial = false): string {
  const parts = [`${name}.`, `Distance ${fmtDistance(s.distanceM, imperial)}, in ${hm(s.durationMs)}${s.movingMs ? ` (${hm(s.movingMs)} moving)` : ''}.`];
  if (s.climbM >= 3 || s.descentM >= 3) parts.push(`Climbed ${fmtDistance(s.climbM, imperial)} and descended ${fmtDistance(s.descentM, imperial)}.`);
  if (s.highestM !== null) parts.push(`Highest point ${fmtDistance(s.highestM, imperial)} above sea level.`);
  return parts.join(' ');
}

/** True when every number in the text appears in the facts or the note. Pure. */
function numbersFit(text: string, allowed: string): boolean {
  const have = new Set(allowed.match(/\d+(?:\.\d+)?/g) ?? []);
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => have.has(n));
}

/** The page: the facts, then the AI's story when it keeps to them. */
export async function trailPage(name: string, stats: TrailStats, opts: { note?: string; imperial?: boolean; ask?: typeof askShaped } = {}): Promise<string> {
  const { note = '', imperial = false, ask = askShaped } = opts;
  const facts = trailFacts(name, stats, imperial);
  try {
    const story = (await ask(SYSTEM, `Facts: ${facts}\nWalker's note: ${note.trim().slice(0, 600) || '(none)'}\n\nJournal entry:`, { label: 'Writing the trail journal', maxTokens: 220 })).trim();
    if (story.length >= 30 && numbersFit(story, `${facts} ${note}`)) return `${facts}\n\n${story}`;
  } catch { /* the facts alone */ }
  return facts;
}
