import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { readAloud, useReadAloud } from '../atlasVoice/readAloud';
import { MAX_SAVE_CHARS, saveReadingAsAudio } from '../atlasVoice/saveReading';

const SLEEP_CHOICES = [0, 15, 30, 60];

/** Sleep timer, where reading picked up, and saving the reading as an audio file. */
export const ReadAloudExtras: React.FC<{ text: string; title: string; canSave: boolean }> = ({ text, title, canSave }) => {
  const { colors } = useTheme();
  const reader = useReadAloud();
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const chooseSleep = (m: number) => { setMinutes(m); readAloud.setSleep(m); };
  const save = async () => {
    setSaving(true); setSaved(''); setError('');
    try {
      const r = await saveReadingAsAudio(text, title);
      setSaved(`Saved to ${r.path}${r.savedChars < r.totalChars ? `. Only the first ${r.savedChars.toLocaleString()} of ${r.totalChars.toLocaleString()} characters fit in one file.` : ''}`);
    } catch (e) { setError((e as Error)?.message || 'Could not save the audio'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.wrap}>
      {reader.resumedAt > 0 && (
        <Text style={[styles.meta, { color: colors.textSecondary }]} testID="read-aloud-resumed">Picked up where you left off, at part {reader.resumedAt + 1}. Use the back button to go to an earlier part.</Text>
      )}
      <Text style={[styles.label, { color: colors.text }]}>Sleep timer</Text>
      <View style={styles.row}>
        {SLEEP_CHOICES.map((m) => (
          <TouchableOpacity key={m} onPress={() => chooseSleep(m)} accessibilityRole="radio" accessibilityState={{ selected: minutes === m }} testID={`read-aloud-sleep-${m}`}
            style={[styles.chip, { borderColor: minutes === m ? colors.primary : colors.border, backgroundColor: minutes === m ? colors.primary : colors.surface }]}>
            <Text style={{ color: minutes === m ? colors.background : colors.text }}>{m ? `${m} min` : 'Off'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {minutes > 0 && <Text style={[styles.meta, { color: colors.textSecondary }]}>Reading pauses at the end of the part being read when the time is up, and keeps your place.</Text>}
      <TouchableOpacity onPress={save} disabled={!canSave || saving} testID="read-aloud-save" accessibilityRole="button"
        style={[styles.action, { borderColor: colors.primary }, (!canSave || saving) && styles.dim]}>
        {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Save as audio file</Text>}
      </TouchableOpacity>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>One file holds about {Math.round(MAX_SAVE_CHARS / 1000)} thousand characters (around 20 minutes), made on this phone in the voice chosen above.</Text>
      {!!saved && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="read-aloud-saved">{saved}</Text>}
      {!!error && <Text style={[styles.meta, { color: colors.error }]} testID="read-aloud-save-error">{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  label: { ...TYPOGRAPHY.h3 },
  meta: { ...TYPOGRAPHY.bodySmall },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  dim: { opacity: 0.5 },
});
