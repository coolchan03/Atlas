/**
 * Searching project documents with a follow-up question. "What about 2024?" or "and the penalty?" finds nothing on its own, because
 * what it is about was said in the question before. A short or pointing question gets the previous question's words added to the
 * search (only the search: the model still sees the question as typed). No model is asked: this is a plain rule, as in the retrieval
 * pipeline of Project NOMAD, which rewrites follow-ups with a model; a phone cannot afford a second model call per message.
 */
interface Turn { role: string; content?: string }

const POINTING = /^(and|also|but|so|then|what about|how about|what else|why|how come|which|where|when|who|is it|is that|does it|do they|can it|can they|those|that|these|this|it|they|them|its)\b/i;
const FILLER = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'it', 'its', 'that', 'this', 'those', 'these', 'they', 'them', 'what', 'about', 'how', 'why', 'when', 'where', 'who', 'which', 'do', 'does', 'did', 'can', 'could', 'would', 'should', 'me', 'you', 'i', 'there', 'else', 'also', 'so', 'then']);

const contentWords = (text: string): string[] => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !FILLER.has(w));

/** True when a question cannot be searched on its own: it has too few words of its own, or begins by pointing back. */
export function needsContext(question: string): boolean {
  const q = question.trim();
  return contentWords(q).length < 3 || POINTING.test(q);
}

/** The text to search the documents with: the question, plus the previous user question when this one depends on it. */
export function followUpQuery(question: string, messages: Turn[] | undefined): string {
  if (!messages?.length || !needsContext(question)) return question;
  const users = messages.filter((m) => m.role === 'user' && (m.content ?? '').trim());
  // The current question is normally already the last user message: the one before it is what this follows.
  const lastIsCurrent = users.length > 0 && (users[users.length - 1].content ?? '').trim() === question.trim();
  const previous = users[users.length - (lastIsCurrent ? 2 : 1)]?.content?.trim();
  if (!previous) return question;
  return `${previous.slice(0, 300)} ${question}`;
}
