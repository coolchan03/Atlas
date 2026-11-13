import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING } from '../constants';
import { Fold } from '../components/Fold';
import { useVoiceProfiles } from './profiles';
import { useCloneReferences } from './cloneStore';
import { useNeuralVoices, voiceCatalog } from './neural';
import { buildVoiceChoices, profileIdFor, type VoiceChoice } from './voiceChoices';

/**
 * Pick any voice for a Home widget or a call: your saved voices and cloned voices first, then (folded away) the phone's voice and every
 * speaker of the voices installed. A voice that was never saved is saved as a profile when picked. `value` is a saved profile id.
 */
export function VoicePicker({ value, onPick, defaultLabel, testID }: { value: string | undefined; onPick: (profileId: string | undefined) => void; defaultLabel: string; testID: string }) {
  const { colors } = useTheme();
  const profiles = useVoiceProfiles((s) => s.profiles);
  const references = useCloneReferences((s) => s.references);
  const installed = useNeuralVoices((s) => s.installed);
  const choices = useMemo(() => buildVoiceChoices({ profiles, references, voices: voiceCatalog(installed), installed }), [profiles, references, installed]);
  const pick = (c: VoiceChoice) => onPick(profileIdFor(c, (p) => useVoiceProfiles.getState().addProfile(p)));
  const chip = (key: string, label: string, state: { selected: boolean; onPress: () => void }) => (
    <TouchableOpacity key={key} onPress={state.onPress} accessibilityRole="radio" accessibilityState={{ selected: state.selected }} testID={`${testID}-${key}`}
      style={[styles.chip, { borderColor: state.selected ? colors.primary : colors.border, backgroundColor: state.selected ? colors.primary : colors.surface }]}>
      <Text style={{ color: state.selected ? colors.background : colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
  const top = choices.filter((c) => c.group !== 'installed');
  const more = choices.filter((c) => c.group === 'installed');
  return (
    <View testID={testID}>
      <View style={styles.chips}>
        {chip('none', defaultLabel, { selected: !value, onPress: () => onPick(undefined) })}
        {top.map((c) => chip(c.key, c.label, { selected: !!c.profile && c.profile.id === value, onPress: () => pick(c) }))}
      </View>
      {more.length > 0 && (
        <Fold title={`More voices (${more.length})`} testID={`${testID}-more`}>
          <View style={styles.chips}>{more.map((c) => chip(c.key, c.label, { selected: !!c.profile && c.profile.id === value, onPress: () => pick(c) }))}</View>
        </Fold>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
});
