/** What to offer on Home to carry on studying, and what Home search finds. Pure, so it is tested without a device. */
import { describePace, pace } from '../../cpa/schedule';
import type { Course } from '../../topics/store';

export interface ContinueTarget { courseId: string; key: string; title: string; squareTitle: string; done: number; total: number }

/** The course played most recently that still has a square to play, and its next square. */
export function continueTarget(courses: Course[]): ContinueTarget | null {
  const played = courses.filter((c) => c.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  for (const c of played) {
    const next = c.squares.find((s) => !c.progress[s.key]);
    if (next) return { courseId: c.id, key: next.key, title: c.title, squareTitle: next.title, done: c.squares.filter((s) => c.progress[s.key]).length, total: c.squares.length };
  }
  return null;
}

/** The nearest exam that has a date still to come, as a sentence about pace. */
export function nextExamLine(exams: Array<{ label: string; examDate?: string; remaining: number }>, now = Date.now()): string | null {
  const dated = exams.map((e) => ({ e, p: pace(e.examDate, e.remaining, now) })).filter((x) => x.p && x.p.daysLeft >= 0).sort((a, b) => a.p!.daysLeft - b.p!.daysLeft);
  return dated.length ? `${dated[0].e.label}: ${describePace(dated[0].p!)}` : null;
}

export interface HomeHit { kind: 'screen' | 'course' | 'project' | 'chat'; id: string; label: string; hint: string }
export interface HomeSearchSources {
  tiles: Array<{ key: string; label: string; hint: string }>;
  courses: Array<{ id: string; title: string; topic: string }>;
  projects: Array<{ id: string; name: string; description?: string }>;
  chats: Array<{ id: string; title: string; isPrivate?: boolean; pinVerifier?: string; protectedBlob?: string }>;
}

/** Everything whose name (or hint) contains every word typed. Private and locked chats are never listed. */
export function searchHome(query: string, src: HomeSearchSources, limit = 12): HomeHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const hits: HomeHit[] = [
    ...src.tiles.filter((t) => all(`${t.label} ${t.hint}`)).map((t) => ({ kind: 'screen' as const, id: t.key, label: t.label, hint: t.hint })),
    ...src.courses.filter((c) => all(`${c.title} ${c.topic}`)).map((c) => ({ kind: 'course' as const, id: c.id, label: c.title, hint: 'Course' })),
    ...src.projects.filter((p) => all(`${p.name} ${p.description ?? ''}`)).map((p) => ({ kind: 'project' as const, id: p.id, label: p.name, hint: 'Project' })),
    ...src.chats.filter((c) => !c.isPrivate && !c.pinVerifier && !c.protectedBlob && all(c.title)).map((c) => ({ kind: 'chat' as const, id: c.id, label: c.title, hint: 'Chat' })),
  ];
  return hits.slice(0, limit);
}
