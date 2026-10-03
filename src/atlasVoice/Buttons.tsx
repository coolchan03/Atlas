import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useUiModeStore } from '../stores/uiModeStore';
import { useAtlasVoiceStore } from './store';
import { speak, stop } from './tts';

/** Header button: switch between typing and voice ("phone call") mode. */
export function AtlasModeToggle() {
  const { colors } = useTheme();
  const mode = useUiModeStore((s) => s.interfaceMode);
  const setMode = useUiModeStore((s) => s.setInterfaceMode);
  const on = mode === 'audio';
  return (
    <TouchableOpacity
      onPress={() => { if (on) stop(); setMode(on ? 'chat' : 'audio'); }}
      style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surface, marginRight: 6 }}
      accessibilityLabel={on ? 'Leave voice mode' : 'Voice mode'}
    >
      <Icon name="phone-call" size={16} color={on ? '#fff' : colors.textSecondary} />
    </TouchableOpacity>
  );
}

/** Speaker button under each answer: tap to read it aloud, tap again to stop. */
export function AtlasSpeakButton({ text, messageId }: { text: string; messageId: string }) {
  const { colors } = useTheme();
  const playing = useAtlasVoiceStore((s) => s.speakingMessageId === messageId && s.speakingKey !== null);
  return (
    <TouchableOpacity
      onPress={() => (playing ? stop() : speak(text, messageId))}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={playing ? 'Stop reading' : 'Read aloud'}
    >
      <Icon name={playing ? 'volume-x' : 'volume-2'} size={14} color={playing ? colors.primary : colors.textSecondary} />
    </TouchableOpacity>
  );
}
