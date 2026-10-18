import { registerHook, HOOKS } from '../bootstrap/hookRegistry';
import { registerSlot, SLOTS } from '../bootstrap/slotRegistry';
import { useUiModeStore } from '../stores/uiModeStore';
import { useChatStore } from '../stores/chatStore';
import { prepareMessageForSpeech } from '../utils/messageContent';
import { speak, stop, ttsAvailable, warmUp } from './tts';
import { restoreVoice, restoreSavedVoice, loadVoiceForSpeech } from './neural';
import { profileForConversation, profileForMessage, type VoiceProfile } from './profiles';
import { useAtlasVoiceStore } from './store';
import { AtlasAudioInput } from './AudioInput';
import { AtlasModeToggle, AtlasSpeakButton } from './Buttons';
import { AtlasVoicePanel } from './VoicePanel';
import logger from '../utils/logger';

/**
 * Read a reply in the answering agent's own voice profile (if any), then put the saved
 * voice back so emergency cards, study and other screens keep the user's choice.
 */
function speakAsAgent(text: string, messageId: string, profile: VoiceProfile | null): void {
  if (!profile) {
    restoreSavedVoice().catch(() => undefined).finally(() => speak(text, messageId));
    return;
  }
  loadVoiceForSpeech(profile.voiceId, profile.sid).catch(() => undefined).finally(() => {
    speak(text, messageId, profile.rate);
  });
}

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
  const restore = () => {
    // Voices may live on the SD card: tell the native side where, then reload the chosen voice.
    const { useStoragePrefs, applyStoragePrefs } = require('../atlasTools/storage');
    const sp: any = useStoragePrefs.persist;
    const go = () => { applyStoragePrefs(); restoreVoice().catch(() => undefined); };
    if (sp?.hasHydrated?.()) go(); else sp?.onFinishHydration?.(go);
  };
  const ps: any = (useAtlasVoiceStore as any).persist;
  if (ps?.hasHydrated?.()) restore(); else ps?.onFinishHydration?.(restore);
  registerHook(HOOKS.audioCanSpeak, () => true);
  registerHook(HOOKS.audioSpeak, (text: string, messageId: string) => {
    speakAsAgent(prepareMessageForSpeech(text), messageId, profileForMessage(messageId));
  });
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
    speakAsAgent(prepareMessageForSpeech(last.content), last.id, profileForConversation(conversationId));
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
