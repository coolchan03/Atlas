/**
 * Practice questions from both phones. Studying on each phone must not overwrite the other: every question from either phone is
 * kept, and for each question the copy with more attempts (the one that has been studied more) keeps its review schedule; with equal
 * attempts the later review date wins. The questions answered per day take the larger count. Settings follow the copy changed most recently.
 */
type Obj = Record<string, any>;

/** True when `theirs` has been studied more than `mine` (more attempts, or the same attempts and a later review date). */
const studiedMore = (theirs: Obj, mine: Obj): boolean => {
  const a = theirs.attempts ?? 0; const b = mine.attempts ?? 0;
  return a > b || (a === b && (theirs.due ?? 0) > (mine.due ?? 0));
};

function mergeProgress(mine: Obj = {}, theirs: Obj = {}): Obj {
  const out: Obj = { ...mine };
  for (const [id, p] of Object.entries<Obj>(theirs)) if (!out[id] || studiedMore(p, out[id])) out[id] = p;
  return out;
}

function mergeDaily(mine: Obj = {}, theirs: Obj = {}): Obj {
  const out: Obj = { ...mine };
  for (const [day, n] of Object.entries<number>(theirs)) out[day] = Math.max(out[day] ?? 0, n);
  return out;
}

export function mergeExercises(localRaw: string, remoteRaw: string, remoteNewer = true): string {
  const a = JSON.parse(localRaw); const b = JSON.parse(remoteRaw);
  const x: Obj = a.state ?? {}; const y: Obj = b.state ?? {};
  const state = {
    ...(remoteNewer ? { ...x, ...y } : { ...y, ...x }),
    exercises: { ...(y.exercises ?? {}), ...(x.exercises ?? {}) },
    progress: mergeProgress(x.progress, y.progress),
    daily: mergeDaily(x.daily, y.daily),
  };
  return JSON.stringify({ ...(remoteNewer ? { ...a, ...b } : { ...b, ...a }), state, version: Math.max(a.version ?? 0, b.version ?? 0) });
}
