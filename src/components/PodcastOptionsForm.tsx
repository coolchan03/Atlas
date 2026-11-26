import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import {
  PICKER_STYLES, PODCAST_FORMATS, PODCAST_MINUTE_PRESETS, MIN_PODCAST_MINUTES, MAX_PODCAST_MINUTES,
  clampMinutes, lengthPlan, hostsFor, type PodcastStyle,
} from '../study/podcastFormats';
import { PodcastVoicePicker } from './PodcastVoicePicker';

export interface PodcastChoices { prompt: string; minutes: number; hosts: 1 | 2 | 3; style: PodcastStyle; research: boolean }
export const DEFAULT_PODCAST: PodcastChoices = { prompt: '', minutes: 5, hosts: 2, style: 'casual', research: false };

/** What the length means on this phone: parts, spoken words and a rough time to write it. */
function lengthNote(minutes: number, tokensPerSecond?: number): string {
  const p = lengthPlan(minutes, tokensPerSecond);
  const time = p.writeMinutes <= 1 ? 'about a minute' : `about ${p.writeMinutes} minutes`;
  return `${p.parts} ${p.parts === 1 ? 'part' : 'parts'}, around ${p.words.toLocaleString()} spoken words. Writing it takes ${time} on this phone.`;
}

/**
 * Everything a person chooses for one podcast episode: what it is about, how long, who speaks and the format. Study and
 * Learn a topic both show this, so the two never drift apart.
 */
export const PodcastOptionsForm: React.FC<{
  value: PodcastChoices;
  onChange: (next: PodcastChoices) => void;
  /** How many voices are installed; with fewer than two the episode is a solo narrator. */
  voiceCount: number;
  promptPlaceholder?: string;
  /** The loaded model's measured speed, for the write-time estimate. */
  tokensPerSecond?: number;
  /** Warning about a small context window, shown for long episodes. */
  contextWarning?: string | null;
  /** Hides the extra-research switch where research does not apply. */
  allowResearch?: boolean;
}> = ({ value, onChange, voiceCount, promptPlaceholder, tokensPerSecond, contextWarning, allowResearch = true }) => {
  const styles = useThemedStyles(createStyles);
  const set = (patch: Partial<PodcastChoices>) => onChange({ ...value, ...patch });
  const [typed, setTyped] = useState(String(value.minutes));
  useEffect(() => { setTyped(String(value.minutes)); }, [value.minutes]);
  const format = PODCAST_FORMATS[value.style];
  const hosts = hostsFor(value.style, voiceCount >= 2 ? value.hosts : 1);
  const fixedHosts = !!format.hosts;
  const commit = (text: string) => { const m = clampMinutes(parseInt(text, 10)); setTyped(String(m)); set({ minutes: m }); };
  const step = (by: number) => set({ minutes: clampMinutes(value.minutes + by) });

  return (
    <View testID="podcast-options">
      <Text style={styles.hint}>Leave the prompt empty and it picks the episode itself from your sources.</Text>
      <TextInput value={value.prompt} onChangeText={(t) => set({ prompt: t })} multiline testID="podcast-prompt"
        placeholder={promptPlaceholder ?? 'e.g. Explain how to purify water for a 10-year-old, with examples'}
        placeholderTextColor={styles.placeholder.color} style={styles.input} />

      <Text style={styles.label}>FORMAT</Text>
      <View style={styles.chips}>
        {PICKER_STYLES.map((k) => (
          <TouchableOpacity key={k} onPress={() => set({ style: k })} testID={`podcast-format-${k}`} accessibilityRole="radio"
            accessibilityState={{ selected: value.style === k }} style={[styles.chip, value.style === k && styles.chipOn]}>
            <Text style={value.style === k ? styles.chipTextOn : styles.chipText}>{PODCAST_FORMATS[k].label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint} testID="podcast-format-blurb">{format.blurb}</Text>

      <Text style={styles.label}>HOW LONG</Text>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={() => step(-1)} accessibilityLabel="One minute shorter" testID="podcast-minutes-down" style={styles.stepButton}>
          <Icon name="minus" size={16} color={styles.icon.color} />
        </TouchableOpacity>
        <TextInput value={typed} onChangeText={setTyped} onEndEditing={(e) => commit(e.nativeEvent.text)} onBlur={() => commit(typed)}
          keyboardType="number-pad" maxLength={2} accessibilityLabel="Minutes" testID="podcast-minutes" style={styles.minutes} />
        <Text style={styles.chipText}>min</Text>
        <TouchableOpacity onPress={() => step(1)} accessibilityLabel="One minute longer" testID="podcast-minutes-up" style={styles.stepButton}>
          <Icon name="plus" size={16} color={styles.icon.color} />
        </TouchableOpacity>
      </View>
      <View style={styles.chips}>
        {PODCAST_MINUTE_PRESETS.map((m) => (
          <TouchableOpacity key={m} onPress={() => set({ minutes: m })} testID={`podcast-minutes-${m}`} style={[styles.chip, value.minutes === m && styles.chipOn]}>
            <Text style={value.minutes === m ? styles.chipTextOn : styles.chipText}>{m} min</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint} testID="podcast-length-note">
        {lengthNote(value.minutes, tokensPerSecond)} {`Between ${MIN_PODCAST_MINUTES} and ${MAX_PODCAST_MINUTES} minutes. You can stop at any point and keep what is written.`}
      </Text>
      {value.minutes >= 30 && !!contextWarning && <Text style={styles.warning}>{contextWarning}</Text>}

      {voiceCount >= 2 && (
        <>
          <Text style={styles.label}>PEOPLE ({voiceCount} voices installed)</Text>
          {fixedHosts
            ? <Text style={styles.hint} testID="podcast-hosts-fixed">{format.label} uses {format.hosts === 1 ? 'one narrator' : `${format.hosts} voices`}.</Text>
            : (
              <View style={styles.chips}>
                {([1, 2, 3] as const).filter((n) => n <= Math.min(3, voiceCount)).map((n) => (
                  <TouchableOpacity key={n} onPress={() => set({ hosts: n })} testID={`podcast-hosts-${n}`} style={[styles.chip, value.hosts === n && styles.chipOn]}>
                    <Text style={value.hosts === n ? styles.chipTextOn : styles.chipText}>{n === 1 ? 'Solo narrator' : `${n} hosts`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          <Text style={styles.label}>VOICES</Text>
          <PodcastVoicePicker hosts={hosts} />
        </>
      )}

      {allowResearch && (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Extra research</Text>
            <Text style={styles.hint}>Also look in your offline library and, when online, the web. Extra sources are marked in the episode.</Text>
          </View>
          <Switch value={value.research} onValueChange={(v) => set({ research: v })} testID="podcast-research" />
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  hint: { ...TYPOGRAPHY.meta, color: colors.textSecondary, marginTop: SPACING.xs },
  label: { ...TYPOGRAPHY.meta, color: colors.textSecondary, marginTop: SPACING.md },
  placeholder: { color: colors.textMuted },
  icon: { color: colors.text },
  warning: { ...TYPOGRAPHY.meta, color: colors.error, marginTop: SPACING.xs },
  input: { ...TYPOGRAPHY.body, backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: SPACING.sm, marginTop: SPACING.sm, minHeight: 56 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.xs, marginTop: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm, marginTop: SPACING.xs },
  stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  minutes: { ...TYPOGRAPHY.body, color: colors.text, minWidth: 48, textAlign: 'center' as const, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 2 },
  switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.md, marginTop: SPACING.md },
  switchText: { flex: 1 },
  switchTitle: { ...TYPOGRAPHY.body, color: colors.text },
});
