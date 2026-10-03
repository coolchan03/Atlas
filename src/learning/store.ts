import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LearnEventKind = 'question' | 'report' | 'judge' | 'manager' | 'info' | 'error';
export interface LearnEvent { id: string; at: number; kind: LearnEventKind; agentId: string; title: string; body: string }

export interface LearnConfig {
  topic: string;
  /** Project whose knowledge base the learner and judge may search ('' = none). */
  projectId: string;
  reportsPerJudge: number;
  judgesPerManager: number;
}

interface PerAgent {
  /** Running counters so the cadence survives app restarts. */
  reportsSinceJudge: number;
  judgesSinceManager: number;
  totalReports: number;
  /** The manager's steering note, fed to learner and judge. */
  direction: string;
  /** The manager's calibration note for the judge (too harsh / too lenient / focus). */
  judgeNote: string;
  /** Judge findings waiting for the manager's audit. */
  pendingFindings: string[];
  recentQuestions: string[];
}

const blank = (): PerAgent => ({ reportsSinceJudge: 0, judgesSinceManager: 0, totalReports: 0, direction: '', judgeNote: '', pendingFindings: [], recentQuestions: [] });

interface LearningState {
  config: Record<string, LearnConfig>;
  state: Record<string, PerAgent>;
  events: LearnEvent[];
  getConfig: (agentId: string) => LearnConfig;
  setConfig: (agentId: string, c: Partial<LearnConfig>) => void;
  get: (agentId: string) => PerAgent;
  patch: (agentId: string, p: Partial<PerAgent>) => void;
  log: (e: Omit<LearnEvent, 'id' | 'at'>) => void;
  clearAgent: (agentId: string) => void;
}

const defaultConfig = (): LearnConfig => ({ topic: '', projectId: '', reportsPerJudge: 3, judgesPerManager: 3 });

export const useLearningStore = create<LearningState>()(
  persist(
    (set, getS) => ({
      config: {},
      state: {},
      events: [],
      getConfig: (id) => ({ ...defaultConfig(), ...(getS().config[id] || {}) }),
      setConfig: (id, c) => set((s) => ({ config: { ...s.config, [id]: { ...defaultConfig(), ...(s.config[id] || {}), ...c } } })),
      get: (id) => ({ ...blank(), ...(getS().state[id] || {}) }),
      patch: (id, p) => set((s) => ({ state: { ...s.state, [id]: { ...blank(), ...(s.state[id] || {}), ...p } } })),
      log: (e) =>
        set((s) => ({
          events: [{ ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() }, ...s.events].slice(0, 300),
        })),
      clearAgent: (id) =>
        set((s) => ({
          state: { ...s.state, [id]: blank() },
          events: s.events.filter((e) => e.agentId !== id),
        })),
    }),
    { name: 'atlas-learning', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
