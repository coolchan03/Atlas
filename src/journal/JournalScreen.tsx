import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { promptFor } from './prompts';
import { dayKey, MOODS, streak, useJournal } from './store';
import { summarizeWeek } from './summary';

/** A private page for each day: a question to start from, how the day felt, and a short look back at the week by the phone's own AI. */
export const JournalScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const { entries, save, remove } = useJournal();
  const today = dayKey();
  const [day, setDay] = React.useState(today);
  const page = entries.find((e) => e.day === day);
  const [text, setText] = React.useState(page?.text ?? '');
  const [mood, setMood] = React.useState<number | null>(page?.mood ?? null);
  const [more, setMore] = React.useState(0);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const open = (d: string) => { const e = entries.find((x) => x.day === d); setDay(d); setText(e?.text ?? ''); setMood(e?.mood ?? null); setMore(0); setNote(''); };
  const run = streak(entries, today);
  const review = async () => {
    setBusy(true); setNote('');
    try { const s = await summarizeWeek(entries, today); setSummary(s); if (!s) setNote('Write a page first: there is nothing from the last week to look back on.'); }
    catch (e) { setNote(`The AI could not write it: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    setBusy(false);
  };
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Journal" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="journal-day">{day === today ? `TODAY, ${day}` : day}{run > 1 ? `  ·  ${run} DAYS IN A ROW` : ''}</Text>
        <TouchableOpacity onPress={() => setMore(more + 1)} accessibilityRole="button" accessibilityLabel="Another question" testID="journal-prompt">
          <Text style={{ color: colors.primary, ...TYPOGRAPHY.body }}>{promptFor(day, more)}</Text>
        </TouchableOpacity>
        <TextInput value={text} onChangeText={setText} multiline testID="journal-text" placeholder="Write here. It stays on this phone." placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <View style={styles.moods}>
          {MOODS.map((m) => (
            <TouchableOpacity key={m.value} onPress={() => setMood(mood === m.value ? null : m.value)} accessibilityRole="radio" accessibilityState={{ selected: mood === m.value }} testID={`journal-mood-${m.value}`}
              style={[styles.mood, { borderColor: mood === m.value ? colors.primary : colors.border }]}>
              <Icon name={m.icon} size={18} color={mood === m.value ? colors.primary : colors.textSecondary} />
              <Text style={{ color: mood === m.value ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.meta }}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <Button title="Save" onPress={() => { save(day, text, mood); setNote('Saved.'); }} disabled={!text.trim() && mood === null} testID="journal-save" />
          {!!page && <Button title="Delete" variant="outline" onPress={() => { remove(day); setText(''); setMood(null); setNote(''); }} testID="journal-delete" />}
          {day !== today && <Button title="Back to today" variant="outline" onPress={() => open(today)} testID="journal-today" />}
        </View>
        {!!note && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="journal-note">{note}</Text>}

        <Button title={busy ? 'Writing...' : 'Look back on the week'} variant="outline" onPress={() => { void review(); }} disabled={busy} testID="journal-review" />
        {!!summary && <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="journal-summary">{summary}</Text></View>}

        {entries.length > 0 && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>EARLIER PAGES</Text>}
        {entries.filter((e) => e.day !== day).slice(0, 30).map((e) => (
          <TouchableOpacity key={e.day} onPress={() => open(e.day)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" testID={`journal-page-${e.day}`}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>{e.day}{e.mood ? `  ·  ${MOODS.find((m) => m.value === e.mood)?.label.toUpperCase()}` : ''}</Text>
            {!!e.text && <Text numberOfLines={2} style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>{e.text}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 160, textAlignVertical: 'top' },
  moods: { flexDirection: 'row', gap: SPACING.sm },
  mood: { flex: 1, borderWidth: 1, borderRadius: SPACING.sm, paddingVertical: SPACING.sm, alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', gap: SPACING.md, flexWrap: 'wrap' },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.xs },
});
