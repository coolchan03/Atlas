import type { Conversation, Project } from '../types';

/**
 * Searching the chat list. The text of every message is lower-cased once per message list and kept (a message list is replaced, not edited, when a
 * chat changes), so typing a longer query does not lower-case the whole history again on each key. Locked chats and chats in a protected project
 * are never searched by their text, only listed when their project's name matches.
 */
const lowered = new WeakMap<object, string>();

const transcriptOf = (chat: Conversation): string => {
  let text = lowered.get(chat.messages);
  if (text === undefined) {
    text = chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => m.content.toLocaleLowerCase()).join('\n');
    lowered.set(chat.messages, text);
  }
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
