import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { listVoices, speakAndWait, stop as stopSpeech, type TtsVoice } from '../atlasVoice/tts';
import { defaultHostVoices, hostVoices, voiceLabel } from '../atlasVoice/neural';
import { useAtlasVoiceStore } from '../atlasVoice/store';
import { useVoiceProfiles, type VoiceProfile } from '../atlasVoice/profiles';
import { previewProfile } from '../atlasVoice/VoiceProfilesCard';
import { profileForKey, profileKey, profileLabel } from '../atlasVoice/hostVoiceKeys';

const ROLES = ['Host A (anchor)', 'Host B', 'Host C'];
type Styles = ReturnType<typeof createStyles>;

/** One voice button. Memoized so a tap redraws only the buttons that changed. */
const VoiceChip = memo(function VoiceChip({ role, roleIndex, voiceKey, label, on, onPick, onRemove, styles, color }: {
  role: string; roleIndex: number; voiceKey: string; label: string; on: boolean;
  onPick: (role: number, key: string) => void; onRemove?: (key: string) => void; styles: Styles; color: string;
}) {
  return (
    <View style={styles.chipWrap}>
      <TouchableOpacity onPress={() => onPick(roleIndex, voiceKey)} style={[styles.chip, on && styles.chipOn]}
        accessibilityLabel={`${role}: ${label}`} accessibilityState={{ selected: on }} testID={`voice-${roleIndex}-${voiceKey}`}>
        {on && <Icon name="volume-2" size={12} color={color} />}
        <Text style={on ? styles.chipTextOn : styles.chipText}>{label}</Text>
      </TouchableOpacity>
      {!!onRemove && !on && (
        <TouchableOpacity onPress={() => onRemove(voiceKey)} accessibilityLabel={`Remove ${label}`} testID={`voice-remove-${voiceKey}`} hitSlop={8}>
          <Icon name="x" size={14} color={styles.reset.color} />
        </TouchableOpacity>
      )}
    </View>
  );
});

/** Every voice that could be added: saved and cloned voices first, then the other voices on the phone, minus those already shown. */
const AddVoicePanel: React.FC<{ voices: TtsVoice[]; profiles: VoiceProfile[]; shown: string[]; onAdd: (key: string) => void; styles: Styles }> = ({ voices, profiles, shown, onAdd, styles }) => {
  const saved = profiles.filter((p) => !shown.includes(profileKey(p.id)));
  const others = voices.filter((v) => !shown.includes(v.name));
  return (
    <View style={styles.panel} testID="add-voice-panel">
      {!!saved.length && <Text style={styles.label}>Your saved and cloned voices</Text>}
      <View style={styles.chips}>
        {saved.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => onAdd(profileKey(p.id))} style={styles.chip} testID={`add-voice-${profileKey(p.id)}`} accessibilityLabel={`Add ${profileLabel(p)}`}>
            <Text style={styles.chipText}>{profileLabel(p)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!others.length && <Text style={styles.label}>Other voices</Text>}
      <View style={styles.chips}>
        {others.map((v, k) => (
          <TouchableOpacity key={v.name} onPress={() => onAdd(v.name)} style={styles.chip} testID={`add-voice-${v.name}`} accessibilityLabel={`Add ${voiceLabel(v.name, k)}`}>
            <Text style={styles.chipText}>{voiceLabel(v.name, k)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!saved.length && !others.length && <Text style={styles.label}>Every voice is already here.</Text>}
    </View>
  );
};

/**
 * Choose the voice of each podcast and briefing host. Each host starts with three voices to pick from; "Add voice" brings in any
 * other voice, including your saved and cloned voices. Tap a voice to pick it and hear it. A voice that is later removed falls
 * back to the automatic pick.
 */
export function PodcastVoicePicker({ hosts = 3 }: { hosts?: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const profiles = useVoiceProfiles((s) => s.profiles);
  const chosen = useAtlasVoiceStore((s) => s.podcastVoices);
  const extras = useAtlasVoiceStore((s) => s.podcastExtraVoices);
  const [adding, setAdding] = useState<number | null>(null);
  // What is shown as picked changes the moment a voice is tapped, before the saved setting and the preview catch up.
  const [shown, setShown] = useState<string[] | null>(null);
  useEffect(() => { listVoices('en').then(setVoices).catch(() => undefined); }, []);
  useEffect(() => { setShown(null); }, [chosen]);
  const stored = useMemo(() => (voices.length >= 2 ? hostVoices(voices) : []), [voices, chosen, profiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = shown ?? stored;
  const exists = useCallback((key: string) => (profileForKey(key, profiles) ? true : voices.some((v) => v.name === key)), [profiles, voices]);
  // The starting three, the voices the person added, and anything now picked, each once and only if it still exists.
  const options = useMemo(() => [...new Set([...defaultHostVoices(voices), ...extras, ...current])].filter(exists), [voices, extras, current, exists]);
  const labelOf = (key: string) => { const p = profileForKey(key, profiles); return p ? profileLabel(p) : voiceLabel(key, voices.findIndex((v) => v.name === key)); };

  const pick = useCallback((role: number, key: string) => {
    const next = [...(shown ?? stored)];
    next[role] = key;
    setShown(next);
    // Save and speak after the button has redrawn; the previous preview is cut off so previews do not queue up.
    setTimeout(() => {
      useAtlasVoiceStore.getState().setPodcastVoices(next);
      stopSpeech();
      const profile = profileForKey(key, useVoiceProfiles.getState().profiles);
      if (profile) { previewProfile(profile).catch(() => undefined); return; }
      speakAndWait(`Hello, I'm ${ROLES[role].replace(/ \(.*\)/, '')}.`, { voice: key }).catch(() => undefined);
    }, 0);
  }, [shown, stored]);
  const add = (role: number, key: string) => {
    useAtlasVoiceStore.getState().setPodcastExtraVoices([...new Set([...extras, key])]);
    setAdding(null);
    pick(role, key);
  };
  const remove = (key: string) => useAtlasVoiceStore.getState().setPodcastExtraVoices(extras.filter((e) => e !== key));

  if (voices.length < 2) return null;
  return (
    <View testID="podcast-voice-picker">
      {ROLES.slice(0, Math.max(1, Math.min(3, hosts))).map((role, i) => (
        <View key={role} style={styles.row}>
          <Text style={styles.label}>{role}</Text>
          <View style={styles.chips}>
            {options.map((key) => (
              <VoiceChip key={key} role={role} roleIndex={i} voiceKey={key} label={labelOf(key)} on={current[i] === key} onPick={pick}
                onRemove={extras.includes(key) ? remove : undefined} styles={styles} color={colors.background} />
            ))}
            <TouchableOpacity onPress={() => setAdding(adding === i ? null : i)} style={styles.addButton} accessibilityRole="button" testID={`add-voice-${i}`} accessibilityLabel={`Add a voice for ${role}`}>
              <Icon name="plus" size={14} color={colors.primary} />
              <Text style={styles.addText}>Add voice</Text>
            </TouchableOpacity>
          </View>
          {adding === i && <AddVoicePanel voices={voices} profiles={profiles} shown={options} onAdd={(key) => add(i, key)} styles={styles} />}
        </View>
      ))}
      {(chosen.length > 0 || extras.length > 0) && (
        <TouchableOpacity onPress={() => { useAtlasVoiceStore.getState().setPodcastVoices([]); useAtlasVoiceStore.getState().setPodcastExtraVoices([]); }}>
          <Text style={styles.reset}>Use the three automatic voices</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  row: { marginTop: SPACING.sm, gap: SPACING.xs },
  label: { ...TYPOGRAPHY.meta, color: colors.textSecondary },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: SPACING.xs, marginTop: SPACING.xs },
  chipWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  chip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  addButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 16, borderWidth: 1, borderColor: colors.primary,
  },
  addText: { ...TYPOGRAPHY.bodySmall, color: colors.primary },
  panel: { marginTop: SPACING.xs, padding: SPACING.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: SPACING.xs },
  reset: { ...TYPOGRAPHY.bodySmall, color: colors.primary, marginTop: SPACING.sm },
});
