import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { useJournal } from '../journal/store';
import { isOpen, MAX_LETTER, monthsAfter, OPEN_AFTER, useCapsules } from './store';
import { lookBack } from './summary';

const dateText = (t: number) => new Date(t).toDateString();

/** A letter to yourself that stays shut until a date you choose. When it opens, it comes with a look back at your journal for that time. */
export const TimeCapsuleScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const { capsules, seal, setSummary, remove } = useCapsules();
  const entries = useJournal((s) => s.entries);
  const [letter, setLetter] = React.useState('');
  const [months, setMonths] = React.useState<number>(12);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const now = Date.now();
  const sealIt = () => {
    const ok = seal(letter, monthsAfter(Date.now(), months));
    if (ok) { setLetter(''); setNote('Sealed. It stays shut until the date.'); } else setNote('Write the letter first.');
  };
  const read = async (id: string, sealedAt: number, opensAt: number) => {
    setBusy(id); setNote('');
    try { setSummary(id, await lookBack(entries, sealedAt, opensAt)); }
    catch (e) { setNote(`The AI could not write the look back: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    setBusy(null);
  };
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Time capsule" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Write to the person you will be. The letter stays shut on this phone until the date you pick, and cannot be read before it.</Text>
        <TextInput value={letter} onChangeText={setLetter} multiline maxLength={MAX_LETTER} testID="capsule-letter" placeholder="Dear future me..." placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <View style={styles.row}>
          {OPEN_AFTER.map((o) => (
            <TouchableOpacity key={o.months} onPress={() => setMonths(o.months)} accessibilityRole="radio" accessibilityState={{ selected: months === o.months }} testID={`capsule-after-${o.months}`}
              style={[styles.chip, { borderColor: months === o.months ? colors.primary : colors.border }]}>
              <Text style={{ color: months === o.months ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button title="Seal it" onPress={sealIt} disabled={!letter.trim()} testID="capsule-seal" />
        {!!note && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="capsule-note">{note}</Text>}
        {capsules.length > 0 && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>YOUR CAPSULES</Text>}
        {capsules.map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`capsule-${c.id}`}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>{`SEALED ${dateText(c.sealedAt).toUpperCase()}`}</Text>
            {isOpen(c, now) ? (
              <>
                <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID={`capsule-letter-${c.id}`}>{c.letter}</Text>
                {c.summary ? <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }} testID={`capsule-summary-${c.id}`}>{c.summary}</Text>
                  : <Button title={busy === c.id ? 'Writing...' : 'Look back on that time'} variant="outline" onPress={() => { void read(c.id, c.sealedAt, c.opensAt); }} disabled={busy === c.id} testID={`capsule-lookback-${c.id}`} />}
              </>
            ) : <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID={`capsule-shut-${c.id}`}>{`Shut. Opens on ${dateText(c.opensAt)}.`}</Text>}
            <Button title="Delete" variant="outline" onPress={() => remove(c.id)} testID={`capsule-delete-${c.id}`} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 160, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.sm },
});
