/**
 * Which tools a chat uses. One place decides it, for both what the chat shows and what a turn
 * sends: the chat's own choice if it has one, else its agent's default tools, else the app-wide
 * defaults from Settings -> Tools. Turning a tool on or off inside a chat changes only that chat.
 */
import { useAppStore } from '../../stores/appStore';
import { useAgentStore } from '../../stores/agentStore';
import { useChatStore } from '../../stores/chatStore';

type ChatLike = { enabledTools?: string[]; agentId?: string | null } | null | undefined;

/** Where a chat's tools come from, for the label on the tools screen. */
export function toolSourceFor(conv: ChatLike): 'chat' | 'agent' | 'app' {
  if (Array.isArray(conv?.enabledTools)) return 'chat';
  const agent = conv?.agentId ? useAgentStore.getState().agents.find((a) => a.id === conv.agentId) : null;
  return Array.isArray(agent?.enabledTools) ? 'agent' : 'app';
}

/** `appDefaults` lets a caller that already holds the settings pass them in. */
export function toolsForConversation(conv: ChatLike, appDefaults?: string[]): string[] {
  if (Array.isArray(conv?.enabledTools)) return conv!.enabledTools!;
  const agent = conv?.agentId ? useAgentStore.getState().agents.find((a) => a.id === conv.agentId) : null;
  if (Array.isArray(agent?.enabledTools)) return agent!.enabledTools!;
  return appDefaults ?? useAppStore.getState().settings.enabledTools ?? [];
}

const conversation = (id: string) => useChatStore.getState().conversations.find((c) => c.id === id);

/** Turns one tool on or off for this chat only (other chats keep theirs). */
export function toggleChatTool(conversationId: string, toolId: string): void {
  const cur = toolsForConversation(conversation(conversationId));
  const next = cur.includes(toolId) ? cur.filter((t) => t !== toolId) : [...cur, toolId];
  useChatStore.getState().setConversationTools(conversationId, next);
}

/** Back to the agent's (or the app's) default tools. */
export function resetChatTools(conversationId: string): void {
  useChatStore.getState().setConversationTools(conversationId, null);
}
