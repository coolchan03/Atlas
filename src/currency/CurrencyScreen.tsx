import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { Select, type SelectOption } from '../components/Select';
import { useWideLayout } from '../hooks/useWideLayout';
import { readNumber } from '../workflows/calc';
import { CURRENCIES } from './currencies';
import { ageInDays, rateBetween, showMoney } from './convert';
import { updateRates } from './service';
import { useCurrency } from './store';

const OPTIONS: SelectOption[] = CURRENCIES.map((c) => ({ id: c.code, label: `${c.code}  ${c.name}` }));
const STALE_DAYS = 7;

/** Converts an amount between two kinds of money. Rates are fetched when asked, kept with their date, and can be typed in for a pair. */
export const CurrencyScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(700);
  const { from, to, amount, rates, date, own, set, swap, setOwn } = useCurrency();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pair = `${from}>${to}`;
  const rate = rateBetween(from, to, rates, own[pair]);
  const value = readNumber(amount);
  const age = ageInDays(date);
  const refresh = async () => {
    setBusy(true); setError(null);
    try { await updateRates(); } catch (e) { setError(String((e as Error)?.message || e)); }
    setBusy(false);
  };
  const typedRate = own[pair];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Currency" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <TextInput value={amount} onChangeText={(v) => set({ amount: v })} keyboardType="decimal-pad" testID="currency-amount" accessibilityLabel="Amount"
          style={[styles.amount, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Amount" placeholderTextColor={colors.textMuted} />
        <View style={styles.pair}>
          <View style={styles.half}><Select label="From" options={OPTIONS} value={from} onChange={(id) => set({ from: id })} testID="currency-from" /></View>
          <TouchableOpacity onPress={swap} accessibilityRole="button" accessibilityLabel="Swap the two" testID="currency-swap"><Icon name="repeat" size={20} color={colors.primary} /></TouchableOpacity>
          <View style={styles.half}><Select label="To" options={OPTIONS} value={to} onChange={(id) => set({ to: id })} testID="currency-to" /></View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {value === null && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.body }} testID="currency-need-number">Type an amount, for example 25 or 1,200.50.</Text>}
          {value !== null && rate !== null && (
            <>
              <Text style={{ color: colors.text, ...TYPOGRAPHY.h1 }} testID="currency-result">{showMoney(value * rate)} {to}</Text>
              <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="currency-rate">1 {from} = {showMoney(rate)} {to}{typedRate ? ' (your rate)' : ''}</Text>
            </>
          )}
          {value !== null && rate === null && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.body }} testID="currency-no-rate">{Object.keys(rates).length ? `There is no rate for ${from} to ${to}: type your own below.` : 'No rates yet. Update them (needs the internet once) or type your own rate below.'}</Text>}
        </View>
        <Text style={{ color: age !== null && age > STALE_DAYS ? colors.error : colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="currency-date">
          {date ? `Rates are from ${date} (European Central Bank)${age !== null && age > STALE_DAYS ? `, ${age} days old: update them before relying on them` : ''}.` : 'The rates are not on this phone yet.'}
        </Text>
        <Button title={busy ? 'Updating...' : 'Update the rates'} variant="outline" onPress={() => { void refresh(); }} disabled={busy} testID="currency-update" />
        {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="currency-error">{error}</Text>}
        <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>Your own rate for {from} to {to}</Text>
        <TextInput value={typedRate ? String(typedRate) : ''} onChangeText={(v) => setOwn(pair, readNumber(v))} keyboardType="decimal-pad" testID="currency-own"
          placeholder={`How many ${to} one ${from} buys (optional)`} placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>A rate you type is used instead of the fetched one. The rates are a guide: a bank or exchange office sets its own.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  amount: { ...TYPOGRAPHY.h1, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md },
  pair: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  half: { flex: 1 },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, gap: SPACING.xs },
});
