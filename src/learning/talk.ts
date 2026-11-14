/**
 * Starts a chat with the AI that has been learning: its own agent (if it has one), its project's documents, and the tools it needs to answer from what
 * it learned and to check the connected sources when that is not enough. Service logic, so the screen only opens the chat it makes.
 */
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useLearningStore } from './store';
import { isNoAgent, expertName } from './agents';

/** What a talk chat can use. The project's own document search is added by the chat when it belongs to a project. */
export const TALK_TOOLS = ['learned_knowledge', 'search_offline_library', 'web_search', 'read_url', 'get_current_datetime', 'calculator'];

export interface TalkChat { conversationId: string; projectId?: string; starter: string }

export function startTalkChat(agentId: string): TalkChat {
  const app = useAppStore.getState();
  const modelId = app.activeModelId ?? app.downloadedModels[0]?.id;
  if (!modelId) throw new Error('Download or pick a text model first.');
  const cfg = useLearningStore.getState().getConfig(agentId);
  const projectId = cfg.projectId || undefined;
  const chat = useChatStore.getState();
  const name = isNoAgent(agentId) ? 'the AI' : expertName(agentId);
  const conversationId = chat.createConversation(modelId, `Talk to ${name}`, projectId);
  if (!isNoAgent(agentId)) chat.setConversationAgent(conversationId, agentId);
  chat.setConversationTools(conversationId, TALK_TOOLS);
  const topic = cfg.topic.trim();
  return {
    conversationId, projectId,
    starter: `You are the AI that has been learning${topic ? ` about: ${topic}` : ''}. For each question, call learned_knowledge first. If it has nothing relevant, check the connected sources with your tools, and say which source each part of your answer came from, or that you could not find it. My question: `,
  };
}
