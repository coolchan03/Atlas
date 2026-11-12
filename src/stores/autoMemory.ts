import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAboutMe } from './aboutMeStore';

export interface MemoryCandidate { id: string; fact: string; source: 'therapy' | 'preferences'; createdAt: number }
interface AutoMemoryState {
  enabled: boolean;
  therapyReview: boolean;
  autoSavePreferences: boolean;
  /** The review queue is ephemeral: sensitive conversation details are never stored in AsyncStorage. */
  pending: MemoryCandidate[];
  set: (p: Partial<Pick<AutoMemoryState, 'enabled' | 'therapyReview' | 'autoSavePreferences'>>) => void;
  propose: (text: string, therapy: boolean) => void;
  approve: (id: string) => void;
  dismiss: (id: string) => void;
}

const sensitive = /\b(?:suicid\w*|self.harm|depress\w*|anxiet\w*|medicat\w*|diagnos\w*|therap\w*|trauma\w*|grief|grieving|bereave\w*|abuse\w*|password|pin\s*code|credit\s*card|account\s*number|bank\s*account|politic\w*|religio\w*|sexual\w*|address|street|phone\s*number)\b/i;
/** Capture explicit, stable first-person preferences only; never silently infer diagnoses or character traits. */
export function extractMemoryCandidate(text: string): { fact: string; category: 'preferences' | 'therapy' } | null {
  const short = text.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (short.length < 12 || short.length > 600) return null;
  const therapy = /^(?:I(?:'ve| have) (?:been )?struggl(?:e|ing) with|My (?:therapy )?goal is|I want to work on)\b/i;
  const generic = /^(?:I (?:really )?(?:prefer|like|love|enjoy)|My favorite|I always want|My goal is)\b/i;
  const category = therapy.test(short) ? 'therapy' : generic.test(short) ? 'preferences' : null;
  if (!category) return null;
  const first = short.match(/^[^.!?]{12,220}(?:[.!?]|$)/)?.[0].trim() ?? '';
  if (first.length < 12 || first.length > 220) return null;
  return { fact: first, category: sensitive.test(first) || category === 'therapy' ? 'therapy' : 'preferences' };
}

export const useAutoMemory = create<AutoMemoryState>()(persist((set, get) => ({
  enabled: false,
  therapyReview: false,
  autoSavePreferences: false,
  pending: [],
  set: (updates) => set((s) => ({ ...s, ...updates })),
  propose: (text, isTherapy) => {
    const st = get();
    if (!st.enabled) return;
    const extracted = extractMemoryCandidate(text);
    if (!extracted) return;
    if ((isTherapy || extracted.category === 'therapy') && !st.therapyReview) return;
    const fact = extracted.fact;
    if (useAboutMe.getState().memories.some((m) => m.toLowerCase() === fact.toLowerCase())) return;
    if (st.pending.some((p) => p.fact.toLowerCase() === fact.toLowerCase())) return;
    const source = isTherapy || extracted.category === 'therapy' ? 'therapy' : 'preferences';
    if (source === 'preferences' && st.autoSavePreferences) { useAboutMe.getState().addMemory(fact); return; }
    // Never automatically store therapy facts; the person explicitly approves each one.
    set((s) => ({ pending: [...s.pending, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fact, source, createdAt: Date.now() }].slice(-20) }));
  },
  approve: (id) => {
    const candidate = get().pending.find((p) => p.id === id);
    if (!candidate) return;
    useAboutMe.getState().addMemory(candidate.fact);
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
  },
  dismiss: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
}), {
  name: 'atlas-memory-choice-v1', version: 1,
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ enabled: s.enabled, therapyReview: s.therapyReview, autoSavePreferences: s.autoSavePreferences }),
}));

/** Called only for a saved, ordinary user chat turn; never read private or PIN-locked messages. */
export function considerUserMemory(text: string, context: { therapy: boolean; private: boolean }): void {
  if (context.private) return;
  useAutoMemory.getState().propose(text, context.therapy);
}
