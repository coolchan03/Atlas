import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { checkCoverage, keyPoints, type PointCheck } from './coverage';
import { tutorNote } from './feedback';

const MAX_SOURCE = 30000;

/** Paste the source you are learning from, explain it in your own words, and see which of its key points you covered. The matching is done by code; the AI asks the next question. */
export const TeachBackScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const [source, setSource] = React.useState('');
  const [explanation, setExplanation] = React.useState('');
  const [checks, setChecks] = React.useState<PointCheck[] | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const run = async () => {
    setBusy(true); setError(''); setNote(''); setChecks(null);
    try {
      const points = keyPoints(source);
      if (points.length < 2) throw new Error('The source is too short to find key points in. Paste a few paragraphs.');
      const result = await checkCoverage(points, explanation);
      setChecks(result);
      setNote(await tutorNote(result));
    } catch (e) { setError(String((e as Error)?.message || e).slice(0, 200)); }
    setBusy(false);
  };
  const got = checks?.filter((c) => c.covered).length ?? 0;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Teach it back" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Explaining a topic is the best way to find what you do not know yet. Paste what you are learning from, then explain it without looking.</Text>
        <TextInput value={source} onChangeText={(t) => setSource(t.slice(0, MAX_SOURCE))} multiline testID="teachback-source" placeholder="Paste the text you are learning from" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <TextInput value={explanation} onChangeText={setExplanation} multiline testID="teachback-explain" placeholder="Now explain it in your own words" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Button title={busy ? 'Checking...' : 'Check my explanation'} onPress={() => { void run(); }} disabled={busy || source.trim().length < 80 || explanation.trim().length < 10} testID="teachback-check" />
        {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="teachback-error">{error}</Text>}
        {checks && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="teachback-score">{`YOU COVERED ${got} OF ${checks.length} KEY POINTS`}</Text>
            {checks.map((c, i) => (
              <View key={i} style={styles.point} testID={`teachback-point-${i}-${c.covered ? 'covered' : 'missed'}`}>
                <Icon name={c.covered ? 'check' : 'x'} size={16} color={c.covered ? colors.primary : colors.error} />
                <Text style={[styles.pointText, { color: colors.text, ...TYPOGRAPHY.bodySmall }]}>{c.point}</Text>
              </View>
            ))}
            {!!note && <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="teachback-note">{note}</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 120, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.sm },
  point: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  pointText: { flex: 1 },
});
