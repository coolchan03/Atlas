import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { SPACING } from '../constants';
import { useAtlasVoiceStore } from './store';
import { useVoiceProfiles } from './profiles';

/** Pick the voice Read aloud uses: the app's current voice, or any saved voice profile (cloned voices included). */
export const ReadVoiceChooser: React.FC = () => {
  const { colors } = useTheme();
  const profiles = useVoiceProfiles((s) => s.profiles);
  const chosen = useAtlasVoiceStore((s) => s.readVoiceId);
  const setChosen = useAtlasVoiceStore((s) => s.setReadVoiceId);
  // A profile that was deleted falls back to the app voice.
  const active = profiles.some((p) => p.id === chosen) ? chosen : '';
  const options = [{ id: '', name: 'My voice' }, ...profiles.map((p) => ({ id: p.id, name: p.name }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="read-voice-chooser">
      {options.map((o) => (
        <TouchableOpacity key={o.id || 'app'} onPress={() => setChosen(o.id)} accessibilityRole="radio" accessibilityState={{ selected: active === o.id }}
          style={[styles.chip, { borderColor: active === o.id ? colors.primary : colors.border, backgroundColor: active === o.id ? colors.primary : colors.surface }]}>
          <Text style={{ color: active === o.id ? colors.background : colors.text }}>{o.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
