import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { listVoices, speakAndWait, type TtsVoice } from '../atlasVoice/tts';
import { hostVoices, voiceLabel } from '../atlasVoice/neural';
import { useAtlasVoiceStore } from '../atlasVoice/store';

const ROLES = ['Host A (anchor)', 'Host B', 'Host C'];

/**
 * Choose the voice of each podcast and briefing host. Tap a voice to pick it and hear it.
 * The choice is kept with the voice settings; a voice that is later removed falls back to
 * the automatic pick.
 */
export function PodcastVoicePicker({ hosts = 3 }: { hosts?: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const chosen = useAtlasVoiceStore((s) => s.podcastVoices);
  useEffect(() => { listVoices('en').then(setVoices).catch(() => undefined); }, []);
  if (voices.length < 2) return null;
  const current = hostVoices(voices);
  const pick = (role: number, name: string) => {
    const next = [...current];
    next[role] = name;
    useAtlasVoiceStore.getState().setPodcastVoices(next);
    speakAndWait(`Hello, I'm ${ROLES[role].replace(/ \(.*\)/, '')}.`, 1, 'podcast', name).catch(() => undefined);
  };
  return (
    <View testID="podcast-voice-picker">
      {ROLES.slice(0, Math.max(1, Math.min(3, hosts))).map((role, i) => (
        <View key={role} style={styles.row}>
          <Text style={styles.label}>{role}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {voices.map((v, k) => {
              const on = current[i] === v.name;
              return (
                <TouchableOpacity key={v.name} onPress={() => pick(i, v.name)} style={[styles.chip, on && styles.chipOn]}
                  accessibilityLabel={`${role}: ${voiceLabel(v.name, k)}`} testID={`voice-${i}-${v.name}`}>
                  {on && <Icon name="volume-2" size={12} color={colors.background} />}
                  <Text style={on ? styles.chipTextOn : styles.chipText}>{voiceLabel(v.name, k)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ))}
      {chosen.length > 0 && (
        <TouchableOpacity onPress={() => useAtlasVoiceStore.getState().setPodcastVoices([])}>
          <Text style={styles.reset}>Use automatic voices</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  row: { marginTop: SPACING.sm, gap: SPACING.xs },
  label: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
  chips: { gap: SPACING.xs, paddingRight: SPACING.md },
  chip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  reset: { ...TYPOGRAPHY.bodySmall, color: colors.primary, marginTop: SPACING.sm },
});
