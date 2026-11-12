/** Optional lightweight chat tone presets. Explicit agent and user instructions win. */
export type ChatTonePreset = 'balanced' | 'creative' | 'serious' | 'precise' | 'playful';
export const CHAT_TONES: { id: ChatTonePreset; name: string; hint: string }[] = [
  { id: 'balanced', name: 'Balanced', hint: 'Adapt to the task' },
  { id: 'creative', name: 'Creative', hint: 'Explore original ideas' },
  { id: 'serious', name: 'Serious', hint: 'Professional and focused' },
  { id: 'precise', name: 'Precise', hint: 'Concise and factual' },
  { id: 'playful', name: 'Playful', hint: 'Casual and light' },
];
const NOTES: Record<ChatTonePreset, string> = {
  balanced: '',
  creative: 'Encourage original ideas, alternatives, and creative brainstorming. Keep factual assertions accurate.',
  serious: 'Use a professional, focused tone. Minimize jokes and digressions.',
  precise: 'Answer precisely and concisely; cite evidence when available. Clearly indicate uncertainty.',
  playful: 'Use a friendly, playful conversational style when appropriate without inventing facts.',
};
export function chatToneNote(tone: ChatTonePreset | undefined, agentHasCustomStyle = false): string {
  if (!tone || agentHasCustomStyle || !NOTES[tone]) return '';
  return `\n\nOPTIONAL CHAT TONE (lower priority than the agent's own instructions): ${NOTES[tone]}`;
}
