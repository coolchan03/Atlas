import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { shouldSuggestTuning, useSlowHint, useSpeedStats, useTuned } from '../atlasTools/speed';

/**
 * One line above the message box when this model has been slow on a few replies: "Replies are slow here
 * (2.1 tok/s). Find faster settings". Opens the model test, where "Find the best settings" measures the options.
 * Goes away once the model was tuned, or when dismissed.
 */
export const SlowReplyHint: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const modelId = useAppStore((s) => s.downloadedModels.find((m) => m.id === s.activeModelId && m.engine === 'llama')?.id ?? null);
  const speed = useSpeedStats((s) => (modelId ? s.byModel[modelId] : undefined));
  const tuned = useTuned((s) => !!(modelId && s.at[modelId]));
  const dismissed = useSlowHint((s) => !!(modelId && s.off[modelId]));
  const busy = useChatStore((s) => s.isStreaming || s.isThinking);
  if (busy || !modelId || !shouldSuggestTuning({ modelId, speed, tuned, dismissed })) return null;
  return (
    <View style={styles.row} testID="slow-reply-hint">
      <Icon name="zap" size={11} color={colors.textMuted} />
      <TouchableOpacity onPress={() => navigation.navigate('ModelTest', { modelId })} accessibilityLabel="Find faster settings for this model">
        <Text style={[styles.text, { color: colors.primary }]}>Replies are slow here ({speed!.decode.toFixed(1)} tok/s). Find faster settings</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => useSlowHint.getState().dismiss(modelId)} accessibilityLabel="Hide this tip" testID="slow-reply-hint-dismiss">
        <Icon name="x" size={12} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 3, gap: 6 },
  text: { fontSize: 11 },
});
