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
    { name: 'atlas-agent-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** The system prompt for a chat: the active agent's, plus project notes underneath. */
export function resolveAgentPrompt(projectPrompt: string | undefined, fallback: string): string {
  const { activeAgentId, agents } = useAgentStore.getState();
  const agent = agents.find((a) => a.id === activeAgentId);
  if (!agent || !agent.systemPrompt.trim()) return projectPrompt?.trim() || fallback;
  return agentPromptWithLessons(agent) + (projectPrompt?.trim() ? `\n\nProject notes:\n${projectPrompt.trim()}` : '');
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
  if (!a) return {};
  const o: any = {};
  if (typeof a.temperature === 'number') o.temperature = a.temperature;
  if (typeof a.topP === 'number') o.topP = a.topP;
  if (typeof a.maxTokens === 'number') o.maxTokens = a.maxTokens;
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
