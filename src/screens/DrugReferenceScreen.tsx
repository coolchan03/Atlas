import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { DRUG_SECTIONS, DrugLabel } from '../drugs/openFda';
import { lookupDrug, useSavedDrugs } from '../drugs/store';

const nameOf = (l: DrugLabel) => l.brand || l.generic;
const subtitle = (l: DrugLabel) => [l.brand && l.generic ? l.generic : '', l.manufacturer, l.type].filter(Boolean).join(' · ');

/** One medicine's label, section by section, in the manufacturer's own words. */
const LabelView: React.FC<{ label: DrugLabel; onBack: () => void }> = ({ label, onBack }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.block} testID="drug-label">
      <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" testID="drug-back">
        <Icon name="arrow-left" size={18} color={colors.primary} />
        <Text style={{ color: colors.primary }}>All results</Text>
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]}>{nameOf(label)}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{subtitle(label)}{label.updated ? ` · label revised ${label.updated}` : ''}</Text>
      {DRUG_SECTIONS.filter((s) => label.sections[s.key]).map((s) => (
        <View key={s.key} style={[styles.card, { backgroundColor: colors.surface, borderColor: s.key === 'boxed_warning' ? colors.error : colors.border }]} testID={`drug-section-${s.key}`}>
          <Text style={[styles.sectionTitle, { color: s.key === 'boxed_warning' ? colors.error : colors.text }]}>{s.title}</Text>
          <Text style={{ color: colors.text }}>{label.sections[s.key]}</Text>
        </View>
      ))}
      {!Object.keys(label.sections).length && <Text style={[styles.meta, { color: colors.textSecondary }]}>This label has no text sections.</Text>}
    </View>
  );
};

/** Look up a medicine's FDA label. Labels seen once are kept on the phone and can be read again with no signal. */
export const DrugReferenceScreen: React.FC = () => {
  const { colors } = useTheme();
  const saved = useSavedDrugs((s) => s.saved);
  const remove = useSavedDrugs((s) => s.remove);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DrugLabel[] | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<DrugLabel | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setNote(''); setOpen(null);
    const r = await lookupDrug(query);
    setResults(r.labels);
    setNote(r.source === 'saved' ? `No connection to the FDA service (${r.reason}). Showing labels saved on this phone.` : r.labels.length ? '' : 'The FDA label data has nothing under that name. Try the generic name or check the spelling.');
    setBusy(false);
  };

  const list = results ?? saved;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Drug labels" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          The FDA's printed label for a medicine: what it is for, dose, warnings, who must not use it, and interactions. A first lookup needs a connection; every label you open is kept here for later with no signal. This is the manufacturer's text, not medical advice.
        </Text>
        <View style={styles.row}>
          <TextInput testID="drug-query" value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" autoCapitalize="none"
            placeholder="Medicine name, such as ibuprofen" placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          <TouchableOpacity onPress={search} disabled={busy || !query.trim()} style={[styles.action, { borderColor: colors.primary }]} testID="drug-search" accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name="search" size={20} color={colors.primary} />}
          </TouchableOpacity>
        </View>
        {!!note && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="drug-note">{note}</Text>}
        {open ? <LabelView label={open} onBack={() => setOpen(null)} /> : (
          <View style={styles.block}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{results ? 'Results' : `Saved on this phone (${saved.length})`}</Text>
            {!list.length && !results && <Text style={[styles.meta, { color: colors.textSecondary }]}>Nothing saved yet. Search for a medicine above.</Text>}
            {list.map((l) => (
              <View key={l.id} style={[styles.card, styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={styles.grow} onPress={() => setOpen(l)} accessibilityRole="button" testID={`drug-open-${l.id}`}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{nameOf(l)}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{subtitle(l)}</Text>
                </TouchableOpacity>
                {!results && (
                  <TouchableOpacity onPress={() => remove(l.id)} accessibilityLabel={`Remove ${nameOf(l)}`} testID={`drug-remove-${l.id}`}>
                    <Icon name="trash-2" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },
  block: { gap: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: SPACING.md },
  action: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  title: { ...TYPOGRAPHY.h2 },
  sectionTitle: { ...TYPOGRAPHY.h3 },
  meta: { ...TYPOGRAPHY.bodySmall },
  card: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, gap: SPACING.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  grow: { flex: 1 },
});
