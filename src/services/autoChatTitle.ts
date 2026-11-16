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

/** Names the chat in the background, then returns the title it set (or null). Safe to call after every answer: it does nothing unless the chat can be named. */
export async function maybeNameChat(conversationId: string, ask?: (system: string, user: string) => Promise<string>): Promise<string | null> {
  const { useChatStore } = require('../stores/chatStore');
  const { useAppStore } = require('../stores/appStore');
  const conv: Conversation | undefined = useChatStore.getState().conversations.find((c: Conversation) => c.id === conversationId);
  if (inFlight.has(conversationId) || !canNameChat(conv, useAppStore.getState().settings?.autoNameChats !== false)) return null;
  inFlight.add(conversationId);
  try {
    const user = conv!.messages.find((m) => m.role === 'user')!.content;
    const reply = conv!.messages.find((m) => m.role === 'assistant' && !!m.content?.trim())!.content;
    const prompt = chatTitleMessages(user, reply);
    const run = ask ?? ((system: string, text: string) => require('../study/engine').askModel(system, text));
    const title = parseChatTitle(await run(prompt.system, prompt.user));
    if (!title) return null;
    useChatStore.getState().setAutoTitle(conversationId, title);
    return useChatStore.getState().conversations.find((c: Conversation) => c.id === conversationId)?.title === title ? title : null;
  } catch { return null; }
  finally { inFlight.delete(conversationId); }
}
