/**
 * Merge for the stores that hold lists you add to on either phone: saved map places, checklists and
 * Survival Manual notes. "The newest copy wins" lost whatever the other phone added, so these merge
 * item by item instead.
 *
 * Deleting is the hard part: an item that is on one phone only is either new there or deleted on the
 * other. The ids both phones had at the last sync (the baseline) tell them apart: one that is in the
 * baseline was deleted; one that is not was added. With no baseline yet (the first sync), nothing is
 * treated as deleted.
 */
export type Baseline = Record<string, string[]>;

export const LIST_STORES = new Set(['atlas-maps', 'atlas-checklists', 'atlas-survival-manual']);

type Obj = Record<string, any>;
type WithId = { id: string };

/** `newer`'s items, plus the items only the older copy has that are new (not in the baseline). */
function mergeById<T extends WithId>(newer: T[] = [], older: T[] = [], base?: string[]): T[] {
  const have = new Set(newer.map((x) => x.id));
  const known = new Set(base ?? []);
  return [...newer, ...older.filter((x) => !have.has(x.id) && !(base && known.has(x.id)))];
}

/** The ids in a store that the baseline records, so the next merge can tell a new item from a deleted one. */
export function listIds(key: string, raw: string): Baseline {
  const state: Obj = JSON.parse(raw)?.state ?? {};
  if (key === 'atlas-maps') return { 'atlas-maps/waypoints': (state.waypoints ?? []).map((w: WithId) => w.id) };
  if (key !== 'atlas-checklists') return {};
  const out: Baseline = { 'atlas-checklists/lists': (state.lists ?? []).map((l: WithId) => l.id) };
  for (const list of state.lists ?? []) out[`atlas-checklists/${list.id}`] = (list.items ?? []).map((i: WithId) => i.id);
  return out;
}

/**
 * The store to save here from this phone's copy and the other phone's. `remoteNewer` says which
 * copy was changed last: its choices (ticks, the unit setting) win where both have the item.
 * Anything tied to this phone's files (the selected map, map file paths, scroll position) stays.
 */
export function mergeListStore(key: string, o: { local: string; remote: string; remoteNewer: boolean; baseline?: Baseline }): string {
  const local = JSON.parse(o.local);
  const remote = JSON.parse(o.remote);
  const mine: Obj = local.state ?? {};
  const theirs: Obj = remote.state ?? {};
  const newer = o.remoteNewer ? theirs : mine;
  const older = o.remoteNewer ? mine : theirs;
  const base = o.baseline ?? {};
  let state: Obj = mine;
  if (key === 'atlas-maps') {
    state = { ...mine, imperial: newer.imperial ?? mine.imperial,
      waypoints: mergeById(newer.waypoints, older.waypoints, base['atlas-maps/waypoints']) };
  } else if (key === 'atlas-checklists') {
    const lists = mergeById(newer.lists, older.lists, base['atlas-checklists/lists']);
    const olderById = new Map<string, Obj>((older.lists ?? []).map((l: Obj) => [l.id, l]));
    state = { ...mine, lists: lists.map((list: Obj) => {
      const other = olderById.get(list.id);
      // A list the older copy has too: its items merge (the list itself is the newer copy's).
      const fromNewer = (newer.lists ?? []).some((l: Obj) => l.id === list.id);
      return other && fromNewer
        ? { ...list, items: mergeById(list.items, other.items, base[`atlas-checklists/${list.id}`]) }
        : list;
    }) };
  } else if (key === 'atlas-survival-manual') {
    state = { ...mine, notes: { ...older.notes, ...newer.notes } };
  }
  return JSON.stringify({ ...local, state });
}
