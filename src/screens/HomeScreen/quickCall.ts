import { Alert } from 'react-native';
import { useAppStore } from '../../stores/appStore';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';
import { useRemoteServerStore } from '../../stores/remoteServerStore';
import { useUiModeStore } from '../../stores/uiModeStore';
import { activeModelService } from '../../services/activeModelService';
import { instrumentalPlayer } from '../../music/backgroundPlayer';
import { useAtlasVoiceStore } from '../../atlasVoice/store';
import { ttsAvailable } from '../../atlasVoice/tts';

export interface CallChoice { agentId?: string; modelId?: string; projectId?: string; voiceProfileId?: string }

/** What a call is titled in the chat list: "Call Jake", or just "Call". */
export const callTitle = (agentId?: string): string => {
  const name = agentId ? useAgentStore.getState().getAgent(agentId)?.name : undefined;
  return name ? `Call ${name}` : 'Call';
};

/**
 * Starts a hands-free call with the chosen agent, model and project folder: the model is loaded first, the chat is made in that
 * project (so the agent can use its documents), and the call screen opens. Anything not chosen is what is loaded now.
 */
export async function startCall(navigate: (screen: string, params: { conversationId: string }) => void, choice: CallChoice = {}): Promise<boolean> {
  if (!ttsAvailable()) { Alert.alert('Voice unavailable', 'The Android speech engine is not available in this build.'); return false; }
  const app = useAppStore.getState();
  const modelId = choice.modelId || app.activeModelId || app.downloadedModels[0]?.id;
  if (!modelId) { Alert.alert('Choose a model', 'Download or load a model first, then you can call.'); return false; }
  try {
    await activeModelService.loadTextModel(modelId);
    // A model chosen for this call must not be shadowed by a remote model that was active before.
    if (choice.modelId) useRemoteServerStore.getState().setActiveRemoteTextModelId(null);
    const chats = useChatStore.getState();
    const id = chats.createConversation(modelId, callTitle(choice.agentId), choice.projectId);
    if (choice.agentId) chats.setConversationAgent(id, choice.agentId);
    if (choice.voiceProfileId) chats.setConversationVoiceProfile(id, choice.voiceProfileId);
    // Background music would be heard by the microphone during a hands-free call.
    instrumentalPlayer.pause();
    chats.setActiveConversation(id);
    useAtlasVoiceStore.getState().setHandsFree(true);
    useUiModeStore.getState().setInterfaceMode('audio');
    navigate('Chat', { conversationId: id });
    return true;
  } catch (e: any) { Alert.alert('Could not start the call', String(e?.message || e)); return false; }
}
