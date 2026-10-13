import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Preparedness checklists with ticks and optional expiry dates, saved on the phone. */
export interface CheckItem { id: string; text: string; done: boolean; expires?: string }
export interface Checklist { id: string; title: string; items: CheckItem[] }

const list = (id: string, title: string, items: string[]): Checklist =>
  ({ id, title, items: items.map((text, i) => ({ id: `${id}-${i}`, text, done: false })) });

export const DEFAULT_CHECKLISTS: Checklist[] = [
  list('gobag', 'Go-bag (grab and leave)', [
    'Water: 1 gallon / 4 L per person per day, for 3 days', 'Water purification tablets or filter', 'Food that keeps (3 days)',
    'Flashlight or headlamp + spare batteries', 'Power bank (charged) + cables', 'First-aid kit', 'Prescription medicines (7 days) + list of doses',
    'Copies of ID, insurance, contacts (paper)', 'Cash in small notes', 'Whistle', 'Warm layer + rain jacket', 'Sturdy shoes',
    'Lighter or matches in a waterproof bag', 'Multi-tool or knife', 'Emergency blanket', 'Paper map of your area', 'Face masks', 'Phone with Atlas offline packs downloaded',
  ]),
  list('home72', '72-hour home kit', [
    'Water stored (3 days per person and pet)', 'Manual can opener', 'Food for 3 days (no cooking needed)', 'Battery or crank radio',
    'Flashlights in each room', 'Spare batteries', 'Bleach (unscented) for water', 'Trash bags and wipes (sanitation)', 'Fire extinguisher (check pressure)',
    'Smoke and CO alarms tested', 'Know how to shut off gas, water and power', 'Pet food and supplies',
  ]),
  list('car', 'Car kit', [
    'Water and snacks', 'Jumper cables', 'Tire inflator / spare checked', 'Blanket and warm clothes', 'Flashlight', 'First-aid kit',
    'Phone charger (12 V to USB)', 'Reflective triangle or flares', 'Ice scraper and small shovel (winter)', 'Paper map',
  ]),
  list('firstaid', 'First-aid kit', [
    'Gauze pads and rolled gauze', 'Adhesive bandages, assorted', 'Elastic bandage', 'Medical tape', 'Gloves', 'Scissors and tweezers',
    'Antiseptic wipes', 'Pain relievers', 'Antihistamine', 'Epinephrine auto-injector (if prescribed)', 'Oral rehydration salts', 'Tourniquet (trained use only)', 'Thermometer',
  ]),
];

interface ChecklistState {
  lists: Checklist[];
  toggle: (listId: string, itemId: string) => void;
  setExpiry: (listId: string, itemId: string, expires: string) => void;
  add: (listId: string, text: string) => void;
  remove: (listId: string, itemId: string) => void;
  reset: (listId: string) => void;
}

const mapItems = (lists: Checklist[], listId: string, fn: (items: CheckItem[]) => CheckItem[]) =>
  lists.map((l) => (l.id === listId ? { ...l, items: fn(l.items) } : l));

export const useChecklists = create<ChecklistState>()(
  persist(
    (set) => ({
      lists: DEFAULT_CHECKLISTS,
      toggle: (l, i) => set((s) => ({ lists: mapItems(s.lists, l, (items) => items.map((x) => (x.id === i ? { ...x, done: !x.done } : x))) })),
      setExpiry: (l, i, expires) => set((s) => ({ lists: mapItems(s.lists, l, (items) => items.map((x) => (x.id === i ? { ...x, expires } : x))) })),
      add: (l, text) => set((s) => ({ lists: mapItems(s.lists, l, (items) => [...items, { id: `${l}-u${Date.now()}`, text, done: false }]) })),
      remove: (l, i) => set((s) => ({ lists: mapItems(s.lists, l, (items) => items.filter((x) => x.id !== i)) })),
      reset: (l) => set((s) => ({ lists: mapItems(s.lists, l, (items) => items.map((x) => ({ ...x, done: false }))) })),
    }),
    { name: 'atlas-checklists', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Items whose expiry date (YYYY-MM-DD) is within `days` from now, or past. */
export function expiringSoon(lists: Checklist[], days = 60, now = Date.now()): { list: string; item: CheckItem }[] {
  return lists.flatMap((l) => l.items.filter((i) => i.expires && Date.parse(i.expires) - now <= days * 86400000).map((item) => ({ list: l.title, item })));
}
