import { registerHook, HOOKS } from '../bootstrap/hookRegistry';
import { registerSlot, SLOTS } from '../bootstrap/slotRegistry';
import { useUiModeStore } from '../stores/uiModeStore';
import { useChatStore } from '../stores/chatStore';
import { prepareMessageForSpeech } from '../utils/messageContent';
import { speak, stop, ttsAvailable, warmUp } from './tts';
import { restoreVoice } from './neural';
import { useAtlasVoiceStore } from './store';
import { AtlasAudioInput } from './AudioInput';
import { AtlasModeToggle, AtlasSpeakButton } from './Buttons';
import { AtlasVoicePanel } from './VoicePanel';
import logger from '../utils/logger';

/**
 * Atlas voice: read-aloud, voice mode and hands-free "phone call" mode for the free
 * build, using the phone's built-in text-to-speech. Fills the same hooks/slots the
 * paid add-on uses, so the rest of the app needs no changes.
 */
export function registerAtlasVoice(): void {
  if (!ttsAvailable()) {
    logger.log('[AtlasVoice] native TTS module missing - voice features disabled');
    return;
  }
  warmUp();
  // Re-load the chosen natural voice once saved settings are loaded.
  const restore = () => { restoreVoice().catch(() => undefined); };
  const ps: any = (useAtlasVoiceStore as any).persist;
  if (ps?.hasHydrated?.()) restore(); else ps?.onFinishHydration?.(restore);
  registerHook(HOOKS.audioCanSpeak, () => true);
  registerHook(HOOKS.audioSpeak, (text: string, messageId: string) => speak(prepareMessageForSpeech(text), messageId));
  registerHook(HOOKS.audioStop, () => stop());
  registerHook(HOOKS.audioOnStreamingEnd, (conversationId: string) => {
    const voiceMode = useUiModeStore.getState().interfaceMode === 'audio';
    if (!voiceMode && !useAtlasVoiceStore.getState().autoSpeakInChat) return;
    const conv = (useChatStore.getState() as any).conversations?.find((c: any) => c.id === conversationId);
    const last = conv?.messages?.[conv.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.content?.trim()) {
      // Nothing to read out: still let hands-free mode reopen the mic.
      if (voiceMode && useAtlasVoiceStore.getState().handsFree) setTimeout(() => useAtlasVoiceStore.getState().markDone(), 300);
      return;
    }
    speak(prepareMessageForSpeech(last.content), last.id);
  });
  registerHook(HOOKS.audioAugmentPrompt, (base: string) =>
    useUiModeStore.getState().interfaceMode === 'audio'
      ? `${base}\n\nThe user is talking to you by voice and your reply will be read aloud. Answer in short, plain spoken sentences. No markdown, tables, lists of symbols or emojis. Put the most important thing first.`
      : base,
  );
  registerSlot(SLOTS.chatInputAudioMode, AtlasAudioInput);
  registerSlot(SLOTS.chatInputModeToggle, AtlasModeToggle);
  registerSlot(SLOTS.messageSpeakButton, AtlasSpeakButton);
  registerSlot(SLOTS.modelsScreenVoiceTab, AtlasVoicePanel);
}
