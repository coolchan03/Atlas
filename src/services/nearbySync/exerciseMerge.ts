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

/** Both copies counted attempts per phone: take each phone's highest count once, so 6 attempts here and 9 there make 15 (repeat syncs change nothing). */
function mergeCounts(winner: Obj, loser: Obj): Obj {
  if (!winner.dev && !loser.dev) return winner;
  const dev: Record<string, { a: number; c: number }> = {};
  for (const src of [winner.dev ?? {}, loser.dev ?? {}]) for (const [d, v] of Object.entries<any>(src)) dev[d] = { a: Math.max(dev[d]?.a ?? 0, v.a), c: Math.max(dev[d]?.c ?? 0, v.c) };
  const base = Math.max(winner.base ?? 0, loser.base ?? 0); const baseC = Math.max(winner.baseC ?? 0, loser.baseC ?? 0);
  const sum = (k: 'a' | 'c') => Object.values(dev).reduce((n, v) => n + v[k], 0);
  return { ...winner, dev, base, baseC, attempts: base + sum('a'), correct: baseC + sum('c') };
}

function mergeProgress(mine: Obj = {}, theirs: Obj = {}): Obj {
  const out: Obj = { ...mine };
  for (const [id, p] of Object.entries<Obj>(theirs)) {
    if (!out[id]) out[id] = p;
    else out[id] = studiedMore(p, out[id]) ? mergeCounts(p, out[id]) : mergeCounts(out[id], p);
  }
  return out;
}

function mergeDaily(mine: Obj = {}, theirs: Obj = {}): Obj {
  const out: Obj = { ...mine };
  for (const [day, n] of Object.entries<number>(theirs)) out[day] = Math.max(out[day] ?? 0, n);
  return out;
}

/** Per-day, per-phone counts: each phone's highest count once, on top of the shared base, so answers on two phones the same day add up. */
function mergeDailyCounts(x: Obj, y: Obj): { daily: Obj; dailyBy: Obj; dailyBase: Obj } {
  const daily = mergeDaily(x.daily, y.daily);
  const dailyBy: Obj = {}; const dailyBase: Obj = {};
  const days = new Set([...Object.keys(x.dailyBy ?? {}), ...Object.keys(y.dailyBy ?? {})]);
  for (const day of days) {
    const by: Record<string, number> = {};
    for (const src of [x.dailyBy?.[day] ?? {}, y.dailyBy?.[day] ?? {}]) for (const [d, n] of Object.entries<number>(src)) by[d] = Math.max(by[d] ?? 0, n);
    const base = Math.max(x.dailyBase?.[day] ?? 0, y.dailyBase?.[day] ?? 0);
    dailyBy[day] = by; dailyBase[day] = base;
    daily[day] = Math.max(daily[day] ?? 0, base + Object.values(by).reduce((a, b) => a + b, 0));
  }
  return { daily, dailyBy, dailyBase };
}

export function mergeExercises(localRaw: string, remoteRaw: string, remoteNewer = true): string {
  const a = JSON.parse(localRaw); const b = JSON.parse(remoteRaw);
  const x: Obj = a.state ?? {}; const y: Obj = b.state ?? {};
  const state = {
    ...(remoteNewer ? { ...x, ...y } : { ...y, ...x }),
    exercises: { ...(y.exercises ?? {}), ...(x.exercises ?? {}) },
    progress: mergeProgress(x.progress, y.progress),
    ...mergeDailyCounts(x, y),
    deviceId: x.deviceId, // each phone keeps its own id
  };
  return JSON.stringify({ ...(remoteNewer ? { ...a, ...b } : { ...b, ...a }), state, version: Math.max(a.version ?? 0, b.version ?? 0) });
}
