import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
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
      style={[styles.modeButton, { backgroundColor: on ? colors.primary : colors.surface }]}
      testID="chat-voice-mode-button"
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'End voice call' : 'Start voice call'}
    >
      <Icon name="phone-call" size={16} color={on ? '#fff' : colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modeButton: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});

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
