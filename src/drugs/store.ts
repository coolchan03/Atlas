import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DRUG_SECTIONS, DrugLabel, searchLabels, tidyLabels } from './openFda';

/** The labels seen so far, kept on the phone: a medicine looked up once can be read again with no signal. */
const MAX_SAVED = 150;

interface S {
  saved: DrugLabel[];
  save: (labels: DrugLabel[]) => void;
  remove: (id: string) => void;
}
export const useSavedDrugs = create<S>()(
  persist(
    (set) => ({
      saved: [],
      save: (labels) => set((s) => {
        const ids = new Set(labels.map((l) => l.id));
        return { saved: [...labels, ...s.saved.filter((x) => !ids.has(x.id))].slice(0, MAX_SAVED) };
      }),
      remove: (id) => set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),
    }),
    { name: 'atlas-drug-labels', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

const matches = (l: DrugLabel, term: string) => `${l.brand} ${l.generic}`.toLowerCase().includes(term);

export interface DrugLookup { labels: DrugLabel[]; /** 'online' when the FDA service answered, 'saved' when only labels saved earlier were used, with the reason why. */ source: 'online' | 'saved'; reason?: string }

/** Looks a medicine up online and saves what it finds; with no connection, falls back to the labels already saved. */
export async function lookupDrug(name: string, fetchFn?: typeof fetch): Promise<DrugLookup> {
  const term = name.trim().toLowerCase();
  const store = useSavedDrugs.getState();
  try {
    const labels = tidyLabels(await searchLabels(name, 8, fetchFn));
    if (labels.length) store.save(labels);
    return { labels, source: 'online' };
  } catch (e) {
    return { labels: tidyLabels(store.saved.filter((l) => matches(l, term))), source: 'saved', reason: (e as Error)?.message || 'No connection' };
  }
}

/** A label as text for the AI: the names, then each section (cut to a length a small model can use). */
export function labelForAi(l: DrugLabel, perSection = 1200): string {
  const head = `${l.brand || l.generic}${l.brand && l.generic ? ` (${l.generic})` : ''}${l.manufacturer ? `, ${l.manufacturer}` : ''}${l.type ? `, ${l.type}` : ''}${l.updated ? `, label revised ${l.updated}` : ''}`;
  const parts = DRUG_SECTIONS.filter((s) => l.sections[s.key]).map((s) => {
    const t = l.sections[s.key]!;
    return `${s.title}: ${t.length > perSection ? `${t.slice(0, perSection)}... (cut)` : t}`;
  });
  return `${head}\n${parts.join('\n')}`;
}

/** What the drug_label tool returns: the best matching labels, or why none could be found. */
export async function drugLabelsForChat(name: string): Promise<string> {
  if (!name.trim()) throw new Error('Missing required parameter: name');
  const r = await lookupDrug(name);
  if (!r.labels.length) {
    return r.source === 'saved'
      ? `No saved label for "${name}", and the FDA service could not be reached (${r.reason}). Do not guess doses or interactions from memory.`
      : `The FDA label data has nothing for "${name}". Try the generic name, or check the spelling.`;
  }
  const note = r.source === 'saved' ? `(Offline: these are labels saved earlier. ${r.reason})\n` : '';
  return `${note}FDA drug label text, the manufacturer's own words. It is not medical advice: say so, and cite the label.\n\n${r.labels.slice(0, 2).map((l) => labelForAi(l)).join('\n\n---\n\n')}`;
}
