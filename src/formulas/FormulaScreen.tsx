import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { evaluateFormula, parseGrid } from './evaluate';
import { writeFormula, type FormulaFailure, type FormulaResult } from './write';

const shown = (v: unknown) => (v === null ? '(empty)' : typeof v === 'number' ? String(Number(v.toFixed(6))) : String(v));

/** Say what the formula should do and paste a few rows of your sheet. The AI writes the formula; Atlas works it out on your rows so you see the real answer before using it. */
export const FormulaScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const [request, setRequest] = React.useState('');
  const [sample, setSample] = React.useState('');
  const [result, setResult] = React.useState<FormulaResult | FormulaFailure | null>(null);
  const [mine, setMine] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const grid = React.useMemo(() => parseGrid(sample), [sample]);
  const write = async () => {
    setBusy(true); setNote(''); setResult(null);
    try { const r = await writeFormula(request, grid); setResult(r); setMine(r.formula); }
    catch (e) { setNote(`The AI could not write it: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    setBusy(false);
  };
  const tried = mine.trim() ? evaluateFormula(mine, grid) : null;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Formula helper" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>Paste a few rows from your sheet, one row per line, cells split by commas or tabs. Column A is the first cell of a line.</Text>
        <TextInput value={sample} onChangeText={setSample} multiline testID="formula-sample" placeholder={'Item, Status, Amount\nRent, paid, 900\nFood, due, 250'} placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <TextInput value={request} onChangeText={setRequest} testID="formula-request" placeholder="What should it work out? For example: total of the amounts that are paid" placeholderTextColor={colors.textMuted}
          style={[styles.line, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Button title={busy ? 'Writing...' : 'Write the formula'} onPress={() => { void write(); }} disabled={busy || !request.trim() || !grid.length} testID="formula-write" />
        {!!note && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="formula-note">{note}</Text>}
        {!!result && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: result.ok ? colors.primary : colors.error }]}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>{result.ok ? 'TRIED ON YOUR ROWS' : 'DID NOT WORK ON YOUR ROWS'}</Text>
            <TextInput value={mine} onChangeText={setMine} autoCapitalize="none" autoCorrect={false} testID="formula-text" style={{ color: colors.text, ...TYPOGRAPHY.body }} />
            {tried && <Text style={{ color: tried.ok ? colors.text : colors.error, ...TYPOGRAPHY.body }} testID="formula-answer">{tried.ok ? `Answer on your rows: ${shown(tried.value)}` : `Cannot work it out: ${tried.error}`}</Text>}
            <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>You can change the formula above; the answer follows. Check it against what you expect before using it.</Text>
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
  line: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.xs },
});
