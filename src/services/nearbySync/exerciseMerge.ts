/**
 * Practice questions from both phones. Studying on each phone must not overwrite the other: every question from either phone is
 * kept, and for each question the copy with more attempts (the one that has been studied more) keeps its review schedule; with equal
 * attempts the later review date wins. The questions answered per day take the larger count. Settings follow the copy changed most recently.
 */
type Obj = Record<string, any>;

export function mergeExercises(localRaw: string, remoteRaw: string, remoteNewer = true): string {
  const a = JSON.parse(localRaw); const b = JSON.parse(remoteRaw);
  const x: Obj = a.state ?? {}; const y: Obj = b.state ?? {};
  const progress: Obj = { ...(x.progress ?? {}) };
  for (const [id, theirs] of Object.entries<Obj>(y.progress ?? {})) {
    const mine = progress[id];
    if (!mine || (theirs.attempts ?? 0) > (mine.attempts ?? 0) || ((theirs.attempts ?? 0) === (mine.attempts ?? 0) && (theirs.due ?? 0) > (mine.due ?? 0))) progress[id] = theirs;
  }
  const daily: Obj = { ...(x.daily ?? {}) };
  for (const [day, n] of Object.entries<number>(y.daily ?? {})) daily[day] = Math.max(daily[day] ?? 0, n);
  const state = {
    ...(remoteNewer ? { ...x, ...y } : { ...y, ...x }),
    exercises: { ...(y.exercises ?? {}), ...(x.exercises ?? {}) },
    progress, daily,
  };
  return JSON.stringify({ ...(remoteNewer ? { ...a, ...b } : { ...b, ...a }), state, version: Math.max(a.version ?? 0, b.version ?? 0) });
}
