import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { accountPool, balance, suggest, type JournalRow } from './journal';

const blankRow = (): JournalRow => ({ account: '', debit: '', credit: '' });

/**
 * A journal entry as a table: an account (typed, or picked from the list that appears under the box), a debit amount and a credit amount
 * for each line. Add a line for each extra account. Where the task gives no numbers, a mark in the column says which side it is on.
 */
export function JournalEntryEditor({ rows, onChange, texts, editable = true }: { rows: JournalRow[]; onChange: (rows: JournalRow[]) => void; texts: string[]; editable?: boolean }) {
  const { colors } = useTheme();
  const pool = useMemo(() => accountPool(...texts), [texts.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [focus, setFocus] = useState(0);
  const set = (i: number, patch: Partial<JournalRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const options = suggest(rows[focus]?.account ?? '', pool);
  const bal = balance(rows);
  const input = { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface };
  return (
    <View style={styles.wrap} testID="journal-editor">
      <View style={styles.row}>
        <Text style={[styles.head, styles.account, { color: colors.textSecondary }]}>Account</Text>
        <Text style={[styles.head, styles.amount, { color: colors.textSecondary }]}>Debit</Text>
        <Text style={[styles.head, styles.amount, { color: colors.textSecondary }]}>Credit</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <TextInput value={r.account} editable={editable} onFocus={() => setFocus(i)} onChangeText={(v) => set(i, { account: v })} placeholder={i === 0 ? 'e.g. Cash' : 'Account'} placeholderTextColor={colors.textMuted}
            autoCapitalize="words" autoCorrect={false} style={[styles.box, styles.account, input]} testID={`journal-account-${i}`} accessibilityLabel={`Account, line ${i + 1}`} />
          <TextInput value={r.debit} editable={editable} onFocus={() => setFocus(i)} onChangeText={(v) => set(i, { debit: v })} keyboardType="numbers-and-punctuation" placeholder="—" placeholderTextColor={colors.textMuted}
            style={[styles.box, styles.amount, input]} testID={`journal-debit-${i}`} accessibilityLabel={`Debit, line ${i + 1}`} />
          <TextInput value={r.credit} editable={editable} onFocus={() => setFocus(i)} onChangeText={(v) => set(i, { credit: v })} keyboardType="numbers-and-punctuation" placeholder="—" placeholderTextColor={colors.textMuted}
            style={[styles.box, styles.amount, input]} testID={`journal-credit-${i}`} accessibilityLabel={`Credit, line ${i + 1}`} />
        </View>
      ))}
      {editable && (
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Pick an account for line {focus + 1}:</Text>
          <View style={styles.chips}>
            {options.map((a) => (
              <TouchableOpacity key={a} onPress={() => set(focus, { account: a })} accessibilityRole="button" accessibilityLabel={`Use ${a}`} testID={`journal-pick-${a}`}
                style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.chipText, { color: colors.text }]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => { onChange([...rows, blankRow()]); setFocus(rows.length); }} accessibilityRole="button" testID="journal-add-line"><Text style={{ color: colors.primary }}>+ Add a line</Text></TouchableOpacity>
            {rows.length > 2 && <TouchableOpacity onPress={() => { onChange(rows.slice(0, -1)); setFocus(Math.min(focus, rows.length - 2)); }} accessibilityRole="button" testID="journal-remove-line"><Text style={{ color: colors.textMuted }}>Remove last line</Text></TouchableOpacity>}
          </View>
        </>
      )}
      {bal && <Text style={[styles.hint, { color: bal.balanced ? colors.primary : colors.textSecondary }]} testID="journal-balance">{bal.balanced ? `Debits and credits agree (${bal.debits.toLocaleString()}).` : `Debits ${bal.debits.toLocaleString()} · Credits ${bal.credits.toLocaleString()}`}</Text>}
    </View>
  );
}

export const newJournalRows = (): JournalRow[] => [blankRow(), blankRow()];

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  head: { fontSize: 12, textTransform: 'uppercase' },
  account: { flex: 2.2, minWidth: 0 },
  amount: { flex: 1, minWidth: 0 },
  box: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15 },
  hint: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 13 },
});
