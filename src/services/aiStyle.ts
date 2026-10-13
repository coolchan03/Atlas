/**
 * Global AI style: how every assistant answers (length, tone, level, emoji, plus the
 * user's own standing instructions), whichever agent or project is active. Turned
 * into one prompt note here so the settings screen and the prompt builder agree.
 */
export type AiLength = 'brief' | 'balanced' | 'detailed';
export type AiTone = 'friendly' | 'neutral' | 'formal' | 'playful' | 'direct';
export type AiLevel = 'simple' | 'normal' | 'expert';

export interface AiStyle {
  length?: AiLength;
  tone?: AiTone;
  level?: AiLevel;
  emoji?: boolean;
  /** Ask a follow-up question at the end of answers. */
  followUps?: boolean;
  /** Free-text standing instructions ("Always use metric units"). */
  custom?: string;
}

export const AI_LENGTHS: Array<{ id: AiLength; name: string; hint: string }> = [
  { id: 'brief', name: 'Brief', hint: 'A few sentences' },
  { id: 'balanced', name: 'Balanced', hint: 'As long as needed' },
  { id: 'detailed', name: 'Detailed', hint: 'Thorough, with examples' },
];
export const AI_TONES: Array<{ id: AiTone; name: string }> = [
  { id: 'friendly', name: 'Friendly' }, { id: 'neutral', name: 'Neutral' }, { id: 'direct', name: 'Direct' },
  { id: 'formal', name: 'Formal' }, { id: 'playful', name: 'Playful' },
];
export const AI_LEVELS: Array<{ id: AiLevel; name: string }> = [
  { id: 'simple', name: 'Simple words' }, { id: 'normal', name: 'Everyday' }, { id: 'expert', name: 'Expert' },
];

const LENGTH_NOTE: Record<AiLength, string> = {
  brief: 'Keep answers short: a few sentences, or a short list when steps are needed. Skip introductions and summaries.',
  balanced: 'Make answers as long as the question needs and no longer.',
  detailed: 'Give thorough answers with explanation, examples and the reasoning behind them.',
};
const TONE_NOTE: Record<AiTone, string> = {
  friendly: 'Sound warm and encouraging.',
  neutral: 'Sound calm and neutral.',
  direct: 'Be direct and to the point; no filler or pleasantries.',
  formal: 'Use a formal, professional tone.',
  playful: 'Be light-hearted and playful where it fits, but stay accurate.',
};
const LEVEL_NOTE: Record<AiLevel, string> = {
  simple: 'Explain in simple, everyday words a young teenager would follow; define any technical term.',
  normal: '',
  expert: 'The user is knowledgeable: use precise technical language and skip the basics.',
};

/** The prompt note for the user's AI style, or '' when nothing is set. */
export function aiStyleNote(style?: AiStyle): string {
  if (!style) return '';
  const parts = [
    style.length && style.length !== 'balanced' ? LENGTH_NOTE[style.length] : '',
    style.tone && style.tone !== 'neutral' ? TONE_NOTE[style.tone] : '',
    style.level ? LEVEL_NOTE[style.level] : '',
    style.emoji === true ? 'An occasional emoji is fine.' : style.emoji === false ? 'Do not use emoji.' : '',
    style.followUps === true ? 'End with one short follow-up question when it would help.' : style.followUps === false ? 'Do not end with follow-up questions.' : '',
  ].filter(Boolean);
  const custom = style.custom?.trim();
  if (!parts.length && !custom) return '';
  const rules = parts.length ? `\n${parts.join(' ')}` : '';
  const own = custom ? `\nThe user's standing instructions: ${custom.slice(0, 1200)}` : '';
  return `\n\nHOW THE USER WANTS YOU TO ANSWER (always follow, unless a safety rule says otherwise):${rules}${own}`;
}
