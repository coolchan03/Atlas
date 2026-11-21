/**
 * How the passages given to a lesson are chosen from what was found: the controlling standard keeps its place when textbooks fill the
 * rest, textbook passages are shared out across the books (best of each book first) instead of the first book taking every slot, and
 * what could not fit is reported, so a lesson can say it was written from part of the material. Pure.
 */
import type { Excerpt } from './sources';

export interface Allocation {
  chosen: Excerpt[];
  /** Passages found but left out for lack of room. */
  omitted: number;
  /** The books and standards that had passages, and how many of each were used. */
  used: Array<{ source: string; role: 'teach' | 'reference'; count: number }>;
  /** Sources that had passages but none made it in. */
  droppedSources: string[];
}

const roleOf = (e: Excerpt): 'teach' | 'reference' => e.role ?? 'teach';

/** Round-robin over the sources in their given order, so every source gets one passage before any gets a second. */
function roundRobin(list: Excerpt[], room: number): Excerpt[] {
  const bySource = new Map<string, Excerpt[]>();
  list.forEach((e) => bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]));
  const out: Excerpt[] = [];
  const queues = [...bySource.values()];
  for (let round = 0; out.length < room; round += 1) {
    let any = false;
    for (const q of queues) {
      if (round < q.length && out.length < room) { out.push(q[round]); any = true; }
    }
    if (!any) break;
  }
  return out;
}

/**
 * Picks at most `max` passages. Up to `reserveReference` places are kept for reference passages (the Code, a standard) whenever any were
 * found, however many textbook passages there are; textbook passages share the rest across the books, higher-ranked first.
 */
export function allocateExcerpts(found: Excerpt[], max: number, reserveReference = 2): Allocation {
  const reference = found.filter((e) => roleOf(e) === 'reference').sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5));
  const other = found.filter((e) => roleOf(e) !== 'reference');
  const refRoom = Math.min(reference.length, reserveReference, max);
  const teach = roundRobin([...other].sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5)), max - refRoom);
  // Room the textbooks did not use goes to more reference passages.
  const refTake = Math.min(reference.length, max - teach.length);
  const chosen = [...teach, ...reference.slice(0, refTake)];
  const tally = new Map<string, { source: string; role: 'teach' | 'reference'; count: number }>();
  chosen.forEach((e) => { const k = `${roleOf(e)}:${e.source}`; const t = tally.get(k) ?? { source: e.source, role: roleOf(e), count: 0 }; t.count += 1; tally.set(k, t); });
  const chosenSources = new Set(chosen.map((e) => e.source));
  return {
    chosen, omitted: found.length - chosen.length, used: [...tally.values()],
    droppedSources: [...new Set(found.map((e) => e.source))].filter((s) => !chosenSources.has(s)),
  };
}
