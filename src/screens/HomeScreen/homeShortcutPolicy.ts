/** Prevent home widgets leaking protected or disappearing private conversations. */
export function shortcutDestination<T extends { id: string; isPrivate?: boolean; pinVerifier?: string; protectedBlob?: string }>(
  conversationId: string | undefined, conversations: T[], unlocked: boolean,
): 'new' | 'existing' | 'locked' {
  if (!conversationId) return 'new';
  const chat = conversations.find((x) => x.id === conversationId);
  if (!chat || chat.isPrivate) return 'new';
  if ((chat.pinVerifier || chat.protectedBlob) && !unlocked) return 'locked';
  return 'existing';
}

export interface ResumableConversation {
  id: string; updatedAt: string; messages: Array<{ role: string }>;
  isPrivate?: boolean; pinVerifier?: string; protectedBlob?: string;
  isArchived?: boolean;
}
export function isWidgetSafeChat(chat: ResumableConversation): boolean {
  return !chat.isPrivate && !chat.pinVerifier && !chat.protectedBlob && !chat.isArchived;
}
/** Last: active chat if safe, otherwise last updated; most used: most sent messages. */
export function selectResumeConversation<T extends ResumableConversation>(
  conversations: T[], mode: 'resume-last' | 'resume-most', activeId?: string | null,
): T | null {
  const eligible = conversations.filter(isWidgetSafeChat);
  if (mode === 'resume-last' && activeId) {
    const active = eligible.find((c) => c.id === activeId);
    if (active) return active;
  }
  const updated = (chat: T) => Date.parse(chat.updatedAt) || 0;
  eligible.sort((a, b) => {
    if (mode === 'resume-most') {
      const count = (c: T) => (c.messages || []).filter((m) => m.role === 'user').length;
      const diff = count(b) - count(a);
      if (diff) return diff;
    }
    return updated(b) - updated(a);
  });
  return eligible[0] || null;
}
