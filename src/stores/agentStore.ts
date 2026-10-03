import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/generateId';

/**
 * Agents (Atlas): reusable personas, each with its own system prompt.
 * Separate from projects: a project holds chats + a knowledge base, an agent decides
 * WHO answers and HOW. The active agent's prompt is used in every chat; a project's
 * own instructions (if any) are added underneath.
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** Learned by learning mode (manager-approved). Added under the system prompt. Editable. */
  lessons?: string;
  /** Per-agent model settings. Unset = use the global settings. */
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  repeatPenalty?: number;
  /** Context length takes effect when the model next loads (it is set when the agent is chosen). */
  contextLength?: number;
  /** Preferred text model: chosen automatically when this agent is picked. Unset = keep the current model. */
  modelId?: string;
  /** Per-agent tool list (e.g. web_search). Unset = use the global tool toggles. */
  enabledTools?: string[];
  createdAt: string;
  updatedAt: string;
}

const now = () => new Date().toISOString();

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    description: 'Offline emergency, medical and survival helper',
    systemPrompt: `You are ATLAS, an offline emergency and survival helper.
Rules:
1. Use the knowledge-base excerpts you are given. If they do not answer the question and you have the search_knowledge_base tool, search with a few short words (for example "severe bleeding" or "snakebite").
2. Answer ONLY from the excerpts and search results. Never invent doses, amounts or times.
3. Reply in short numbered steps. Most urgent step first.
4. Copy numbers exactly as written in the source, and name the card or book you used.
5. If nothing in the knowledge base answers it, say: "Atlas does not cover that." Then give only general safety advice and say it is not from Atlas.
6. Keep answers short. Do not think out loud at length.`,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'field-id',
    name: 'Field Identifier',
    description: 'Photo questions: plants, mushrooms, snakes, insects, rashes, wounds (needs a vision model)',
    systemPrompt: `You help identify things from photos: plants, mushrooms, berries, insects, spiders, snakes, animal tracks, rashes, bites, wounds and objects.
Rules:
1. First describe what you actually see (shape, color, size clues, leaves, markings).
2. Give the 1-3 most likely possibilities and say how sure you are (low / medium / high). Photos are often not enough.
3. NEVER say a wild plant, berry or mushroom is safe to eat from a photo. Say which features to check and that, if not certain, it should not be eaten. Many deadly mushrooms look like edible ones.
4. For snakes, spiders and insects: say whether it could be dangerous and what to do if bitten or stung.
5. For skin, rashes, bites and wounds: list the danger signs that need urgent care. This is a hint, not a diagnosis.
6. Keep it short. Put any danger warning first.`,
    temperature: 0.3,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'General helpful assistant',
    systemPrompt: "You are a helpful AI assistant running locally on the user's device. Be concise and accurate.",
    createdAt: now(),
    updatedAt: now(),
  },
];

interface AgentState {
  agents: Agent[];
  /** null = no agent: the project's prompt or the default prompt is used. */
  activeAgentId: string | null;
  /** Built-in agent ids already offered (so deleted ones do not come back). */
  seenDefaults?: string[];
  createAgent: (a: Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>> & Pick<Agent, 'name' | 'description' | 'systemPrompt'>) => Agent;
  updateAgent: (id: string, updates: Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteAgent: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
  getAgent: (id: string | null | undefined) => Agent | undefined;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: DEFAULT_AGENTS,
      activeAgentId: 'atlas',
      createAgent: (a) => {
        const agent: Agent = { ...a, id: generateId(), createdAt: now(), updatedAt: now() };
        set((s) => ({ agents: [...s.agents, agent] }));
        return agent;
      },
      updateAgent: (id, updates) =>
        set((s) => ({ agents: s.agents.map((x) => (x.id === id ? { ...x, ...updates, updatedAt: now() } : x)) })),
      deleteAgent: (id) =>
        set((s) => ({
          agents: s.agents.filter((x) => x.id !== id),
          activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
        })),
      setActiveAgent: (activeAgentId) => {
        set({ activeAgentId });
        const agent = get().agents.find((a) => a.id === activeAgentId);
        if (agent?.contextLength) applyContextLength(agent.contextLength);
        if (agent?.modelId) {
          try { require('../atlasTools/models').switchToModelInBackground(agent.modelId); } catch { /* ignore */ }
        }
      },
      getAgent: (id) => (id ? get().agents.find((x) => x.id === id) : undefined),
    }),
    {
      name: 'atlas-agent-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // New built-in agents appear in existing installs once; deleting one keeps it deleted.
      merge: (persisted: unknown, current: AgentState): AgentState => {
        const p = (persisted || {}) as Partial<AgentState>;
        const agents: Agent[] = Array.isArray(p.agents) ? p.agents : current.agents;
        const seen: string[] = Array.isArray(p.seenDefaults) ? p.seenDefaults : agents.map((a) => a.id);
        const added = DEFAULT_AGENTS.filter((d) => !seen.includes(d.id) && !agents.some((a) => a.id === d.id));
        return { ...current, ...p, agents: [...agents, ...added], seenDefaults: DEFAULT_AGENTS.map((d) => d.id) };
      },
    },
  ),
);

/** The system prompt for a chat: the active agent's, plus project notes underneath. */
export function resolveAgentPrompt(projectPrompt: string | undefined, fallback: string): string {
  const { activeAgentId, agents } = useAgentStore.getState();
  const agent = agents.find((a) => a.id === activeAgentId);
  const lp = lowPowerNote();
  if (!agent || !agent.systemPrompt.trim()) return (projectPrompt?.trim() || fallback) + lp;
  return agentPromptWithLessons(agent) + (projectPrompt?.trim() ? `\n\nProject notes:\n${projectPrompt.trim()}` : '') + lp;
}

/** An agent's system prompt with its learned lessons underneath. */
export function agentPromptWithLessons(agent: Agent): string {
  const lessons = agent.lessons?.trim();
  return lessons ? `${agent.systemPrompt.trim()}\n\nLessons learned from practice (follow these):\n${lessons}` : agent.systemPrompt.trim();
}

/** Sampling overrides of the active agent (only the ones it sets). */
export function activeAgentOverrides(): { temperature?: number; topP?: number; maxTokens?: number; repeatPenalty?: number } {
  const { activeAgentId, agents } = useAgentStore.getState();
  const a = agents.find((x) => x.id === activeAgentId);
  const o: any = {};
  // Low-battery mode caps answer length for every agent.
  try {
    const lp = require('../atlasTools/lowPower');
    if (lp.lowPowerActive()) {
      const cap = lp.useLowPower.getState().maxTokens;
      const base = (a && typeof a.maxTokens === 'number') ? a.maxTokens : cap;
      o.maxTokens = Math.min(base, cap);
    }
  } catch { /* ignore */ }
  if (!a) return o;
  if (typeof a.temperature === 'number') o.temperature = a.temperature;
  if (typeof a.topP === 'number') o.topP = a.topP;
  if (typeof a.maxTokens === 'number' && o.maxTokens === undefined) o.maxTokens = a.maxTokens;
  if (typeof a.repeatPenalty === 'number') o.repeatPenalty = a.repeatPenalty;
  return o;
}

/** Tools for the active agent, or null to use the global toggles. */
export function activeAgentTools(): string[] | null {
  const { activeAgentId, agents } = useAgentStore.getState();
  const a = agents.find((x) => x.id === activeAgentId);
  return a?.enabledTools ?? null;
}

function applyContextLength(ctx: number): void {
  // Lazy require: the app store imports a lot; keep this store light at load time.
  try {
    const { useAppStore } = require('./appStore');
    const st = useAppStore.getState();
    if (st.settings?.contextLength !== ctx) st.updateSettings({ contextLength: ctx });
  } catch { /* ignore */ }
}

function lowPowerNote(): string {
  try {
    const lp = require('../atlasTools/lowPower');
    return lp.lowPowerActive() ? `\n\n${lp.LOW_POWER_NOTE}` : '';
  } catch { return ''; }
}
