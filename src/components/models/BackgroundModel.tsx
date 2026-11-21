/** "Writing in the background": a smaller, faster model for lessons, music, the briefing and games, so the big chat model does not have to. */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { useAppStore } from '../../stores';
import { useSpeedStats } from '../../atlasTools/speed';

export const BackgroundModelCard: React.FC<{ style?: object }> = ({ style }) => {
  const { colors } = useTheme();
  const models = useAppStore((s) => s.downloadedModels).filter((m) => (m.engine ?? 'llama') === 'llama');
  const chosen = useAppStore((s) => s.settings.backgroundModelId);
  const speeds = useSpeedStats((s) => s.byModel);
  const set = useAppStore((s) => s.updateSettings);
  if (models.length < 2) return null; // with one model there is nothing to choose between
  const fastest = [...models].filter((m) => speeds[m.id]?.decode).sort((a, b) => speeds[b.id].decode - speeds[a.id].decode)[0];
  const chip = (id: string | undefined, label: string, hint?: string) => {
    const on = (chosen ?? '') === (id ?? '');
    return (
      <TouchableOpacity key={id ?? 'none'} onPress={() => set({ backgroundModelId: id })} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`background-model-${id ?? 'none'}`}
        style={[st.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
        <Text style={{ color: on ? colors.background : colors.text }}>{label}</Text>
        {!!hint && <Text style={[st.hint, { color: on ? colors.background : colors.textMuted }]}>{hint}</Text>}
      </TouchableOpacity>
    );
  };
  return (
    <View style={style} testID="background-model">
      <Text style={[st.title, { color: colors.text }]}>Model for writing in the background</Text>
      <Text style={[st.note, { color: colors.textMuted }]}>
        Lessons, music, the daily briefing and games are written by this model instead of the one you chat with. A smaller, faster model finishes them in minutes, not a quarter of an hour. The chat model comes back when the writing is done (loading takes a few seconds each way).
        {fastest ? ` Fastest measured here: ${fastest.name} (${speeds[fastest.id].decode.toFixed(1)} tokens a second).` : ''}
      </Text>
      <View style={st.row}>
        {chip(undefined, 'Same as chat')}
        {models.map((m) => chip(m.id, m.name, speeds[m.id]?.decode ? `${speeds[m.id].decode.toFixed(1)} tok/s` : undefined))}
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  title: { ...TYPOGRAPHY.body },
  note: { ...TYPOGRAPHY.bodySmall, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  hint: { ...TYPOGRAPHY.meta },
});
