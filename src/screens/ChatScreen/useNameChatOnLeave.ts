import { useEffect } from 'react';
import { useChatStore } from '../../stores';
import { nameChatsInBackground } from '../../services/autoChatTitle';

/** When the person leaves the chat, a moment later (once the AI is free) the chat is given a name by what it is about. */
export function useNameChatOnLeave(navigation: { addListener: (event: 'blur' | 'beforeRemove', fn: () => void) => () => void }): void {
  useEffect(() => {
    const nameLater = () => {
      const id = useChatStore.getState().activeConversationId;
      if (id) setTimeout(() => { nameChatsInBackground({ only: id, quietMs: 0 }).catch(() => undefined); }, 2500);
    };
    const offBlur = navigation.addListener('blur', nameLater);
    const offRemove = navigation.addListener('beforeRemove', nameLater);
    return () => { offBlur(); offRemove(); };
  }, [navigation]);
}
