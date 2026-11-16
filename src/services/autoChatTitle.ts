/**
 * Naming a chat by what it is about. A new chat is first titled with the start of its first message; after the first answer the AI gives it a
 * short real name instead ("Planning a Tokyo trip"). Only when it is still the automatic title (a name the person typed is never replaced), never
 * for a private or PIN-locked chat, and only once. If the AI cannot be asked the first-message title simply stays.
 */
import type { Conversation } from '../types';

/** A usable title from the model's reply, or null: one short line, no quotes, no label, not an apology or a sentence. */
export function parseChatTitle(raw: string): string | null {
  const line = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const title = line.replace(/^(?:title|chat title|name)\s*[:\-–]\s*/i, '').replace(/^["'“”‘’*#\s]+|["'“”‘’*\s.!?:;,]+$/g, '').replace(/\s+/g, ' ');
  const words = title.split(' ').filter(Boolean);
  if (title.length < 3 || title.length > 60 || words.length > 8) return null;
  if (/^(sorry|i\b|i'm|as an ai|unable|here is|here's|sure|certainly)/i.test(title)) return null;
  return title;
}

export function chatTitleMessages(firstUser: string, firstReply: string): { system: string; user: string } {
  return {
    system: 'You name chats. Reply with ONLY a title of 2 to 5 words that says what the chat is about, like a chat app would. No quotes, no full stop.',
    user: `The person wrote:\n${firstUser.replace(/\s+/g, ' ').slice(0, 400)}\n\nThe answer began:\n${firstReply.replace(/\s+/g, ' ').slice(0, 400)}\n\nTitle:`,
  };
}

/** Whether a chat is one the AI may name now. */
export function canNameChat(conv: Conversation | undefined, autoName: boolean): boolean {
  if (!conv || !autoName || !conv.titleAuto || conv.isPrivate || conv.pinVerifier || conv.protectedBlob) return false;
  const user = conv.messages.find((m) => m.role === 'user');
  const reply = conv.messages.find((m) => m.role === 'assistant' && !!m.content?.trim());
  return !!user?.content?.trim() && !!reply;
}

const inFlight = new Set<string>();

/** A model is ready to answer without loading anything (the one on the phone, or a server's): a name is never worth loading a model or freeing memory for. */
function modelReady(): boolean {
  try {
    const { llmService } = require('./llm');
    const { useRemoteServerStore } = require('../stores/remoteServerStore');
    return !!llmService.isModelLoaded() || !!useRemoteServerStore.getState().activeRemoteTextModelId;
  } catch { return false; }
}
const generating = (): boolean => { try { return !!require('./llm').llmService.isCurrentlyGenerating(); } catch { return false; } };

/** Names the chat in the background, then returns the title it set (or null). Safe to call after every answer: it does nothing unless the chat can be named. */
export async function maybeNameChat(conversationId: string, ask?: (system: string, user: string) => Promise<string>): Promise<string | null> {
  const { useChatStore } = require('../stores/chatStore');
  const { useAppStore } = require('../stores/appStore');
  const conv: Conversation | undefined = useChatStore.getState().conversations.find((c: Conversation) => c.id === conversationId);
  if (inFlight.has(conversationId) || !canNameChat(conv, useAppStore.getState().settings?.autoNameChats !== false)) return null;
  if (!ask && (!modelReady() || generating())) return null; // only when the AI is free: a name must never get in the way of a reply
  inFlight.add(conversationId);
  try {
    const user = conv!.messages.find((m) => m.role === 'user')!.content;
    const reply = conv!.messages.find((m) => m.role === 'assistant' && !!m.content?.trim())!.content;
    const prompt = chatTitleMessages(user, reply);
    const run = ask ?? ((system: string, text: string) => require('../study/engine').askModel(system, text));
    const title = parseChatTitle(await run(prompt.system, prompt.user));
    if (!title) return null;
    // Only while the title is still the automatic one, so a name the person typed meanwhile is never replaced.
    useChatStore.setState((state: { conversations: Conversation[] }) => ({
      conversations: state.conversations.map((c) => (c.id === conversationId && c.titleAuto ? { ...c, title: title.slice(0, 60), titleAuto: false } : c)),
    }));
    return useChatStore.getState().conversations.find((c: Conversation) => c.id === conversationId)?.title === title ? title : null;
  } catch { return null; }
  finally { inFlight.delete(conversationId); }
}

/**
 * Names the chats that can be named, one at a time, when the person is not waiting on the AI: on leaving a chat, and when the chat list opens.
 * Not straight after a reply: the next message may be on its way, and one model cannot do two things at once. Stops as soon as a reply starts.
 * `only` limits it to one chat (the one just left); `quietMs` skips chats touched very recently (they are probably still being used).
 */
export async function nameChatsInBackground(o: { only?: string; limit?: number; quietMs?: number; /** Replaces the model call (tests). */ ask?: (system: string, user: string) => Promise<string> } = {}): Promise<number> {
  const { useChatStore } = require('../stores/chatStore');
  const { limit = 3, quietMs = 15_000 } = o;
  const now = Date.now();
  const candidates: Conversation[] = (useChatStore.getState().conversations as Conversation[])
    .filter((c) => (!o.only || c.id === o.only) && c.titleAuto && now - (Date.parse(c.updatedAt) || 0) >= quietMs)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  let named = 0;
  for (const c of candidates) {
    if (named >= limit || generating()) break;
    if (await maybeNameChat(c.id, o.ask)) named++;
  }
  return named;
}
