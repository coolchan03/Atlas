import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { encryptedChatStorage } from './encryptedChatStorage';
import { Message, Conversation, GenerationMeta } from '../types';
import { stripStreamingControlTokens, parseModelOutput } from '../utils/messageContent';
import { generateId } from '../utils/generateId';
import { callHook, HOOKS } from '../bootstrap/hookRegistry';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { enforceForageSafety } from '../utils/forageSafety';

/** Field ID replies get the code-enforced foraging safety net. */
function isFieldIdConversation(conv: Conversation | undefined): boolean {
  if (conv?.agentId) return conv.agentId === 'field-id';
  try { return require('./agentStore').useAgentStore.getState().activeAgentId === 'field-id'; } catch { return false; }
}

type PersistedChats = { conversations: Conversation[]; activeConversationId: string | null };
/**
 * zustand's persist writes on EVERY state change, including each streamed token
 * (streamingMessage), and each write serializes every saved chat. Saved chats only
 * change when a message is added or edited, and those updates create new
 * conversation objects, so an identity check of the persisted slice is enough to
 * skip the token-by-token rewrites.
 */
export function skipUnchangedChatWrites(inner: PersistStorage<PersistedChats>): PersistStorage<PersistedChats> {
  let last: { conversations: Conversation[]; activeConversationId: string | null } | null = null;
  const same = (value: StorageValue<PersistedChats>) => !!last &&
    last.activeConversationId === value.state.activeConversationId &&
    last.conversations.length === value.state.conversations.length &&
    last.conversations.every((c, i) => c === value.state.conversations[i]);
  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      if (same(value)) return;
      last = { conversations: value.state.conversations, activeConversationId: value.state.activeConversationId };
      return inner.setItem(name, value);
    },
    removeItem: (name) => { last = null; return inner.removeItem(name); },
  };
}

function nextUpdatedAt(previousUpdatedAt?: string): string {
  const now = Date.now();
  if (!previousUpdatedAt) return new Date(now).toISOString();
  const previousTime = Date.parse(previousUpdatedAt);
  const nextTime = Number.isNaN(previousTime) ? now : Math.max(now, previousTime + 1);
  return new Date(nextTime).toISOString();
}

/** Update a single message inside a conversation's messages array. */
function updateMessageInConv(
  conv: Conversation,
  messageId: string,
  updater: (msg: Message) => Message,
): Conversation {
  return {
    ...conv,
    messages: conv.messages.map((msg) => (msg.id === messageId ? updater(msg) : msg)),
    updatedAt: nextUpdatedAt(conv.updatedAt),
  };
}

/**
 * The portion of the in-progress stream that is safe to SPEAK in voice mode —
 * never the reasoning/thinking. Models that stream reasoning on a separate
 * channel leave streamingMessage answer-only. Models that inline reasoning (e.g.
 * Qwen3, whose chat template injects the opening <think> so only a closing
 * </think> is emitted) are sliced at </think>; until that tag arrives we withhold
 * (return '') while thinking is enabled, so the thought process is never spoken
 * sentence-by-sentence. onStreamingEnd still speaks the final answer if nothing
 * streamed.
 */
function speakableStreamingAnswer(streamingMessage: string, streamingReasoning: string): string {
  if (streamingReasoning.length > 0) return streamingMessage; // reasoning came separately
  const closeIdx = streamingMessage.toLowerCase().lastIndexOf('</think>');
  if (closeIdx !== -1) return streamingMessage.slice(closeIdx + '</think>'.length);
  // No close tag yet: inline reasoning may still be in progress. Withhold while
  // thinking is enabled; otherwise the content is the answer and is safe to speak.
  const { useAppStore } = require('./appStore');
  return useAppStore.getState().settings?.thinkingEnabled ? '' : streamingMessage;
}

/** Derive conversation title from the first user message. */
function deriveTitle(currentTitle: string, role: string, content: string): string {
  if (currentTitle !== 'New Conversation' || role !== 'user') return currentTitle;
  const truncated = content.slice(0, 50);
  return content.length > 50 ? `${truncated}...` : truncated;
}

/** Map over conversations, applying `updater` only to the one matching `conversationId`. */
function mapConversation(
  conversations: Conversation[],
  conversationId: string,
  updater: (conv: Conversation) => Conversation,
): Conversation[] {
  return conversations.map((conv) => (conv.id === conversationId ? updater(conv) : conv));
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingMessage: string;
  streamingReasoningContent: string;
  streamingForConversationId: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  createConversation: (modelId: string, title?: string, projectId?: string, privateChat?: boolean) => string;
  deleteConversation: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  getActiveConversation: () => Conversation | null;
  setConversationProject: (conversationId: string, projectId: string | null) => void;
  setConversationArchived: (conversationId: string, archived: boolean) => void;
  renameConversation: (conversationId: string, title: string) => void;
  setConversationPinVerifier: (conversationId: string, verifier: string | null) => void;
  setConversationAgent: (conversationId: string, agentId: string | null) => void;
  /** Unfile every conversation filed under a project (used when the project is deleted,
   *  so no chat is left pointing at a project that no longer exists). */
  unfileConversationsForProject: (projectId: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => Message;
  updateMessageContent: (conversationId: string, messageId: string, content: string) => void;
  updateMessageThinking: (conversationId: string, messageId: string, isThinking: boolean) => void;
  updateMessageAudio: (conversationId: string, messageId: string, audio: { audioPath?: string; waveformData?: number[]; audioDurationSeconds?: number; isGeneratingAudio?: boolean; isAudioModeMessage?: boolean }) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  deleteMessagesAfter: (conversationId: string, messageId: string) => void;
  startStreaming: (conversationId: string) => void;
  setStreamingMessage: (content: string) => void;
  appendToStreamingMessage: (token: string) => void;
  appendToStreamingReasoningContent: (token: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsThinking: (thinking: boolean) => void;
  finalizeStreamingMessage: (conversationId: string, generationTimeMs?: number, generationMeta?: GenerationMeta) => void;
  clearStreamingMessage: () => void;
  getStreamingState: () => { conversationId: string | null; content: string; reasoningContent: string; isStreaming: boolean; isThinking: boolean };
  updateCompactionState: (conversationId: string, summary?: string, cutoffMessageId?: string) => void;
  clearAllConversations: () => void;
  getConversationMessages: (conversationId: string) => Message[];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      streamingMessage: '',
      streamingReasoningContent: '',
      streamingForConversationId: null,
      isStreaming: false,
      isThinking: false,

      createConversation: (modelId, title, projectId, privateChat = false) => {
        if (projectId && require('./projectStore').useProjectStore.getState().getProject(projectId)?.pinVerifier) {
          throw new Error('This project is encrypted. Create chats separately until protected project content can be encrypted together.');
        }
        const id = generateId();
        const conversation: Conversation = {
          id,
          title: title || 'New Conversation',
          modelId,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          projectId: projectId,
          isPrivate: privateChat,
          agentId: 'atlas',
        };

        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));

        return id;
      },

      deleteConversation: (conversationId) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== conversationId),
          activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId,
        }));
      },

      setActiveConversation: (conversationId) => {
        set({ activeConversationId: conversationId });
      },

      getActiveConversation: () => {
        const state = get();
        return state.conversations.find((c) => c.id === state.activeConversationId) || null;
      },

      setConversationAgent: (conversationId, agentId) => {
        set((state) => ({ conversations: mapConversation(state.conversations, conversationId,
          (conv) => ({ ...conv, agentId: agentId ?? undefined, updatedAt: nextUpdatedAt(conv.updatedAt) })) }));
      },

      setConversationPinVerifier: () => {
        // Legacy API deliberately disabled: editing a verifier without
        // authenticated encryption would turn a locked chat into plaintext.
        throw new Error('Use protectChat or permanentlyUnprotectChat for an authenticated PIN change.');
      },
      renameConversation: (conversationId, title) => {
        const clean = title.trim().slice(0, 100);
        if (!clean) return;
        set((state) => ({ conversations: mapConversation(state.conversations, conversationId,
          (conv) => ({ ...conv, title: clean, updatedAt: nextUpdatedAt(conv.updatedAt) })) }));
      },
      setConversationArchived: (conversationId, archived) => {
        set((state) => ({ conversations: mapConversation(state.conversations, conversationId,
          (conv) => ({ ...conv, isArchived: archived, updatedAt: nextUpdatedAt(conv.updatedAt) })) }));
      },

      setConversationProject: (conversationId, projectId) => {
        if (projectId && require('./projectStore').useProjectStore.getState().getProject(projectId)?.pinVerifier) {
          throw new Error('Protected projects cannot accept unencrypted chats. Permanently unprotect the project first.');
        }
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id !== conversationId
              ? conv
              : { ...conv, projectId: projectId || undefined, updatedAt: nextUpdatedAt(conv.updatedAt) }
          ),
        }));
      },

      unfileConversationsForProject: (projectId) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.projectId !== projectId
              ? conv
              : { ...conv, projectId: undefined, updatedAt: nextUpdatedAt(conv.updatedAt) }
          ),
        }));
      },

      addMessage: (conversationId, messageData) => {
        const message: Message = {
          id: generateId(),
          ...messageData,
          timestamp: Date.now(),
        };

        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, message],
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                  title: deriveTitle(conv.title, messageData.role, messageData.content),
                }
              : conv
          ),
        }));

        return message;
      },

      updateMessageContent: (conversationId, messageId, content) => {
        set((state) => ({
          conversations: mapConversation(state.conversations, conversationId, (conv) =>
            updateMessageInConv(conv, messageId, (msg) => ({ ...msg, content }))
          ),
        }));
      },

      updateMessageThinking: (conversationId, messageId, isThinking) => {
        set((state) => ({
          conversations: mapConversation(state.conversations, conversationId, (conv) =>
            updateMessageInConv(conv, messageId, (msg) => ({ ...msg, isThinking }))
          ),
        }));
      },

      updateMessageAudio: (conversationId, messageId, audio) => {
        set((state) => ({ conversations: mapConversation(state.conversations, conversationId, (conv) => updateMessageInConv(conv, messageId, (msg) => ({ ...msg, ...audio }))) }));
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => ({
          conversations: mapConversation(state.conversations, conversationId, (conv) => ({
            ...conv,
            messages: conv.messages.filter((msg) => msg.id !== messageId),
            updatedAt: nextUpdatedAt(conv.updatedAt),
          })),
        }));
      },

      deleteMessagesAfter: (conversationId, messageId) => {
        set((state) => ({
          conversations: mapConversation(state.conversations, conversationId, (conv) => {
            const messageIndex = conv.messages.findIndex((msg) => msg.id === messageId);
            if (messageIndex === -1) return conv;
            return {
              ...conv,
              messages: conv.messages.slice(0, messageIndex + 1),
              updatedAt: nextUpdatedAt(conv.updatedAt),
            };
          }),
        }));
      },

      startStreaming: (conversationId) => {
        set({
          streamingForConversationId: conversationId,
          streamingMessage: '',
          streamingReasoningContent: '',
          isStreaming: false,
          isThinking: true,
        });
      },

      setStreamingMessage: (content) => {
        set({ streamingMessage: content });
      },

      appendToStreamingMessage: (token) => {
        set((state) => ({
          streamingMessage: stripStreamingControlTokens(state.streamingMessage + token),
          isStreaming: true,
          isThinking: false,
        }));
        // Feed only the ANSWER to pro audio for real-time sentence-by-sentence
        // TTS (never the reasoning) — no-op unless voice mode + engine ready;
        // free builds register nothing.
        callHook(HOOKS.audioOnStreamingToken, speakableStreamingAnswer(get().streamingMessage, get().streamingReasoningContent));
      },

      appendToStreamingReasoningContent: (token) => {
        set((state) => ({
          streamingReasoningContent: state.streamingReasoningContent + token,
          isStreaming: true,
          isThinking: false,
        }));
      },

      setIsStreaming: (streaming) => {
        set({ isStreaming: streaming, isThinking: false });
      },

      setIsThinking: (thinking) => {
        set({ isThinking: thinking });
      },

      finalizeStreamingMessage: (conversationId, generationTimeMs, generationMeta) => {
        const { streamingMessage, streamingReasoningContent, streamingForConversationId, addMessage } = get();

        // Parse ONCE at this boundary through the single shared parser (SoC §A / DR1):
        // split the raw stream into reasoning + a clean answer. The answer is stripped of
        // control and tool-call markup BY CONSTRUCTION, so no raw markup can reach the
        // stored message — and no renderer downstream re-parses message.content.
        const streamReasoning = streamingReasoningContent.trim() || undefined;
        const parsed = parseModelOutput(streamingMessage, streamReasoning);
        const reasoningContent = parsed.reasoning ?? undefined;
        const sanitizedMessage = isFieldIdConversation(get().conversations.find((c) => c.id === conversationId))
          ? enforceForageSafety(parsed.answer) : parsed.answer;
        if (streamingForConversationId === conversationId && (sanitizedMessage || reasoningContent)) {
          addMessage(conversationId, {
            role: 'assistant',
            content: sanitizedMessage,
            reasoningContent,
            generationTimeMs,
            generationMeta,
          });
        }
        set({
          streamingMessage: '',
          streamingReasoningContent: '',
          streamingForConversationId: null,
          isStreaming: false,
          isThinking: false,
        });
      },

      clearStreamingMessage: () => {
        set({
          streamingMessage: '',
          streamingReasoningContent: '',
          streamingForConversationId: null,
          isStreaming: false,
          isThinking: false,
        });
      },

      getStreamingState: () => {
        const state = get();
        return {
          conversationId: state.streamingForConversationId,
          content: state.streamingMessage,
          reasoningContent: state.streamingReasoningContent,
          isStreaming: state.isStreaming,
          isThinking: state.isThinking,
        };
      },

      updateCompactionState: (conversationId, summary, cutoffMessageId) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  compactionSummary: summary,
                  compactionCutoffMessageId: cutoffMessageId,
                  updatedAt: nextUpdatedAt(conv.updatedAt),
                }
              : conv
          ),
        }));
      },

      clearAllConversations: () => {
        set({ conversations: [], activeConversationId: null });
      },

      getConversationMessages: (conversationId) => {
        const conversation = get().conversations.find((c) => c.id === conversationId);
        return conversation?.messages || [];
      },
    }),
    {
      name: 'local-llm-chat-storage',
      storage: skipUnchangedChatWrites(createJSONStorage(() => encryptedChatStorage)!),
      partialize: (state) => {
        // Atlas: private chats are never saved.
        const conversations = state.conversations.filter((c) => !c.isPrivate);
        const activeConversationId = conversations.some((c) => c.id === state.activeConversationId) ? state.activeConversationId : null;
        return { conversations, activeConversationId };
      },
    }
  )
);
