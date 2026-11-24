import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Rates } from './convert';

/** The converter's choices, the last rates fetched (with their date) and the rates the person typed for a pair. Rates stay on the phone. */
interface CurrencyState {
  from: string;
  to: string;
  amount: string;
  rates: Rates;
  /** The day the rates are for ("2026-11-23"), or null before the first update. */
  date: string | null;
  /** A rate typed for one pair, by "USD>EUR". */
  own: Record<string, number>;
  set: (patch: Partial<Pick<CurrencyState, 'from' | 'to' | 'amount'>>) => void;
  setRates: (rates: Rates, date: string) => void;
  setOwn: (pair: string, rate: number | null) => void;
  swap: () => void;
}

export const useCurrency = create<CurrencyState>()(persist((set) => ({
  from: 'USD', to: 'EUR', amount: '100', rates: {}, date: null, own: {},
  set: (patch) => set(patch),
  setRates: (rates, date) => set({ rates: { ...rates, USD: 1 }, date }),
  setOwn: (pair, rate) => set((s) => { const own = { ...s.own }; if (rate && rate > 0) own[pair] = rate; else delete own[pair]; return { own }; }),
  swap: () => set((s) => ({ from: s.to, to: s.from })),
}), { name: 'atlas-currency', version: 1, storage: createJSONStorage(() => AsyncStorage), partialize: ({ from, to, amount, rates, date, own }) => ({ from, to, amount, rates, date, own }) }));
