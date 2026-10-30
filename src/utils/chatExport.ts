/** Plain-text (Markdown) copy of a chat for sharing: user and assistant turns only. */
import type { Conversation } from '../types';

export function conversationToText(conversation: Pick<Conversation, 'title' | 'messages'>): string {
  const turns = conversation.messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.isSystemInfo && m.content.trim())
    .map(m => {
      const images = m.attachments?.filter(a => a.type === 'image').length ?? 0;
      const note = images ? `\n_(${images} image${images > 1 ? 's' : ''} not included)_` : '';
      return `**${m.role === 'user' ? 'You' : 'Atlas'}:** ${m.content.trim()}${note}`;
    });
  return `# ${conversation.title.trim() || 'Chat'}\n\n${turns.join('\n\n')}\n`;
}

/** The same chat as plain text for a .txt file: no Markdown marks, just who said what. */
export function conversationToPlainText(conversation: Pick<Conversation, 'title' | 'messages'>): string {
  const turns = conversation.messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.isSystemInfo && m.content.trim())
    .map(m => {
      const images = m.attachments?.filter(a => a.type === 'image').length ?? 0;
      const note = images ? `\n(${images} image${images > 1 ? 's' : ''} not included)` : '';
      return `${m.role === 'user' ? 'You' : 'Atlas'}: ${m.content.trim()}${note}`;
    });
  return `${conversation.title.trim() || 'Chat'}\n\n${turns.join('\n\n')}\n`;
}

/** True when there is anything to share. */
export function hasShareableTurns(conversation: Pick<Conversation, 'messages'>): boolean {
  return conversation.messages.some(m => (m.role === 'user' || m.role === 'assistant') && !m.isSystemInfo && m.content.trim());
}
