import { stripEmoji } from '../utils/emoji';

/** True while the chat is a phone call (the audio interface). */
const inCall = (): boolean => { try { return require('./uiModeStore').useUiModeStore.getState().interfaceMode === 'audio'; } catch { return false; } };

/** A reply as it arrives: in a phone call every word is read aloud, so no emoji reaches the screen or the voice; otherwise unchanged. */
export const forCall = (text: string): string => (inCall() ? stripEmoji(text) : text);

/** A finished reply: the same, and trimmed after an emoji came off its end (a chat reply is left exactly as it was). */
export const finishForCall = (text: string): string => (inCall() ? stripEmoji(text).trim() : text);
