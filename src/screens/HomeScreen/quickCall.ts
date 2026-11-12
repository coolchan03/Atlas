import { Alert } from 'react-native';
import { useAppStore } from '../../stores/appStore';
import { useChatStore } from '../../stores/chatStore';
import { useUiModeStore } from '../../stores/uiModeStore';
import { activeModelService } from '../../services/activeModelService';
import { instrumentalPlayer } from '../../music/backgroundPlayer';
import { useAtlasVoiceStore } from '../../atlasVoice/store';
import { ttsAvailable } from '../../atlasVoice/tts';

/** One tap from Home: a new hands-free call with the AI that is loaded now (or the first downloaded one). */
export async function startQuickCall(navigate: (screen: string, params: { conversationId: string }) => void): Promise<void> {
  if (!ttsAvailable()) { Alert.alert('Voice unavailable', 'The Android speech engine is not available in this build.'); return; }
  const app = useAppStore.getState();
  const modelId = app.activeModelId || app.downloadedModels[0]?.id;
  if (!modelId) { Alert.alert('Choose a model', 'Download or load a model first, then the call button works.'); return; }
  try {
    if (!app.activeModelId) await activeModelService.loadTextModel(modelId);
    const id = useChatStore.getState().createConversation(modelId, 'Call');
    // Background music would be heard by the microphone during a hands-free call.
    instrumentalPlayer.pause();
    useChatStore.getState().setActiveConversation(id);
    useAtlasVoiceStore.getState().setHandsFree(true);
    useUiModeStore.getState().setInterfaceMode('audio');
    navigate('Chat', { conversationId: id });
  } catch (e: any) { Alert.alert('Could not start the call', String(e?.message || e)); }
}
