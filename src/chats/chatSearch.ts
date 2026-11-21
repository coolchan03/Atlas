import type { Conversation, Project } from '../types';

/**
 * Searching the chat list. The text of every message is lower-cased once per message list and kept (checked against the list's length and last message, so a list
 * that was added to or edited at its end is read again), so typing a longer query does not lower-case the whole history again on each key. Locked chats and chats in a protected project
 * are never searched by their text, only listed when their project's name matches.
 */
interface Kept { length: number; lastId: string; lastLength: number; text: string }
const lowered = new WeakMap<object, Kept>();

const transcriptOf = (chat: Conversation): string => {
  const messages = chat.messages;
  const last = messages[messages.length - 1];
  const kept = lowered.get(messages);
  // Reused only while the list still has the same length and the same last message (a list edited in place would otherwise be searched as it was).
  if (kept && kept.length === messages.length && kept.lastId === (last?.id ?? '') && kept.lastLength === (last?.content.length ?? 0)) return kept.text;
  const text = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => m.content.toLocaleLowerCase()).join('\n');
  lowered.set(messages, { length: messages.length, lastId: last?.id ?? '', lastLength: last?.content.length ?? 0, text });
  return text;
};

/** The chats that match a query by title, message text or project name. An empty query matches all of them. Pure apart from the cache. */
export function matchChats(chats: Conversation[], rawQuery: string, projectOf: (id: string) => Project | null | undefined): Conversation[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return chats;
  return chats.filter((chat) => {
    const project = chat.projectId ? projectOf(chat.projectId) : null;
    if (project && !project.pinVerifier && project.name.toLowerCase().includes(query)) return true;
    if (project?.pinVerifier || chat.pinVerifier) return false;
    return chat.title.toLocaleLowerCase().includes(query) || transcriptOf(chat).includes(query);
  });
}
