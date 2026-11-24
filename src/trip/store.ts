import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TripPhrase { id: string; text: string; translation: string }
export interface PackItem { id: string; text: string; done: boolean }
/** One trip: where it goes (the language spoken and the money used), the phrases translated for it and what to pack. */
export interface Trip { id: string; name: string; language: string; currency: string; home: string; phrases: TripPhrase[]; packing: PackItem[] }

/** What most trips need; the person adds and removes their own. */
export const STARTER_PACKING = ['Passport or ID', 'Tickets and bookings (also saved offline)', 'Phone charger and a power bank', 'Plug adapter', 'Medicines and a copy of the prescriptions', 'Some cash in the local money', 'A bank card that works abroad', 'Comfortable shoes', 'Offline maps downloaded', 'Insurance details'];
/** The phrases most trips need, in the person's own language; each is translated for the trip's language. */
export const BASIC_PHRASES = ['Hello', 'Thank you', 'Please', 'Excuse me', 'Where is the bathroom?', 'How much does this cost?', 'I do not understand', 'Do you speak English?', 'I need a doctor', 'Please help me'];

const id = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface TripState {
  trips: Trip[];
  activeId: string | null;
  start: (name: string, language: string, currency: string) => string;
  select: (id: string) => void;
  update: (id: string, patch: Partial<Pick<Trip, 'name' | 'language' | 'currency' | 'home'>>) => void;
  remove: (id: string) => void;
  addPhrase: (tripId: string, text: string, translation: string) => void;
  removePhrase: (tripId: string, phraseId: string) => void;
  addPack: (tripId: string, text: string) => void;
  togglePack: (tripId: string, itemId: string) => void;
  removePack: (tripId: string, itemId: string) => void;
}

const edit = (trips: Trip[], tripId: string, fn: (t: Trip) => Trip): Trip[] => trips.map((t) => (t.id === tripId ? fn(t) : t));

export const useTrips = create<TripState>()(persist((set) => ({
  trips: [], activeId: null,
  start: (name, language, currency) => {
    const trip: Trip = { id: id(), name: name.trim().slice(0, 40) || 'My trip', language, currency, home: 'USD', phrases: [], packing: STARTER_PACKING.map((text, i) => ({ id: `p${i}`, text, done: false })) };
    set((s) => ({ trips: [trip, ...s.trips].slice(0, 20), activeId: trip.id }));
    return trip.id;
  },
  select: (activeId) => set({ activeId }),
  update: (tripId, patch) => set((s) => ({ trips: edit(s.trips, tripId, (t) => ({ ...t, ...patch })) })),
  remove: (tripId) => set((s) => { const trips = s.trips.filter((t) => t.id !== tripId); return { trips, activeId: s.activeId === tripId ? trips[0]?.id ?? null : s.activeId }; }),
  addPhrase: (tripId, text, translation) => set((s) => ({ trips: edit(s.trips, tripId, (t) => (t.phrases.some((p) => p.text.toLowerCase() === text.toLowerCase()) ? t : { ...t, phrases: [...t.phrases, { id: id(), text, translation }] })) })),
  removePhrase: (tripId, phraseId) => set((s) => ({ trips: edit(s.trips, tripId, (t) => ({ ...t, phrases: t.phrases.filter((p) => p.id !== phraseId) })) })),
  addPack: (tripId, text) => set((s) => ({ trips: edit(s.trips, tripId, (t) => ({ ...t, packing: [...t.packing, { id: id(), text: text.trim().slice(0, 80), done: false }] })) })),
  togglePack: (tripId, itemId) => set((s) => ({ trips: edit(s.trips, tripId, (t) => ({ ...t, packing: t.packing.map((p) => (p.id === itemId ? { ...p, done: !p.done } : p)) })) })),
  removePack: (tripId, itemId) => set((s) => ({ trips: edit(s.trips, tripId, (t) => ({ ...t, packing: t.packing.filter((p) => p.id !== itemId) })) })),
}), { name: 'atlas-trips', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: ({ trips, activeId }) => ({ trips, activeId }) }));
