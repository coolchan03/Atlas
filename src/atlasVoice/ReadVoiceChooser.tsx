import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { SPACING } from '../constants';
import { useAtlasVoiceStore } from './store';
import { useVoiceProfiles } from './profiles';

/** Pick the voice Read aloud uses from the saved voices (natural and cloned ones). With none saved it says how to make one. */
export const ReadVoiceChooser: React.FC = () => {
  const { colors } = useTheme();
  const profiles = useVoiceProfiles((s) => s.profiles);
  const chosen = useAtlasVoiceStore((s) => s.readVoiceId);
  const setChosen = useAtlasVoiceStore((s) => s.setReadVoiceId);
  // A voice that was deleted, or none chosen yet, means the first saved voice.
  const active = profiles.some((p) => p.id === chosen) ? chosen : profiles[0]?.id;
  if (!profiles.length) {
    return <Text style={{ color: colors.textSecondary }} testID="read-voice-none">No saved voices yet. Add a natural voice or clone one under Models, Voice, and it will be listed here.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="read-voice-chooser">
      {profiles.map((p) => (
        <TouchableOpacity key={p.id} onPress={() => setChosen(p.id)} accessibilityRole="radio" accessibilityState={{ selected: active === p.id }}
          style={[styles.chip, { borderColor: active === p.id ? colors.primary : colors.border, backgroundColor: active === p.id ? colors.primary : colors.surface }]}>
          <Text style={{ color: active === p.id ? colors.background : colors.text }}>{p.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
