import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { Select, type SelectOption } from '../components/Select';
import { useWideLayout } from '../hooks/useWideLayout';
import { CURRENCIES } from '../currency/currencies';
import { useCurrency } from '../currency/store';
import { languageFor, TRANSLATOR_LANGUAGES } from '../translator/languages';
import { translateText } from '../translator/translateService';
import { useTranslator } from '../translator/store';
import { speakInAndWait, stop as stopSpeech } from '../atlasVoice/tts';
import { BASIC_PHRASES, useTrips, type Trip } from './store';

const LANGUAGES: SelectOption[] = TRANSLATOR_LANGUAGES.map((l) => ({ id: l.code, label: l.name, hint: l.native }));
const MONEY: SelectOption[] = CURRENCIES.map((c) => ({ id: c.code, label: `${c.code}  ${c.name}` }));
const LINKS: Array<{ label: string; icon: string; route: string }> = [
  { label: 'Maps', icon: 'map', route: 'Maps' }, { label: 'Phrases', icon: 'message-square', route: 'Phrases' },
  { label: 'Emergency', icon: 'alert-triangle', route: 'Emergency' }, { label: 'Helpers', icon: 'list', route: 'Workflows' },
];

/** One place for a trip: the language and money, the phrases translated for it, a packing list, and the screens a trip needs. */
export const TripScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const navigation = useNavigation<any>();
  const store = useTrips();
  const trip: Trip | undefined = store.trips.find((t) => t.id === store.activeId) ?? store.trips[0];
  const [name, setName] = React.useState('');
  const [phrase, setPhrase] = React.useState('');
  const [item, setItem] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const language = trip ? languageFor(trip.language) : null;

  const translateAll = async (texts: string[]) => {
    if (!trip || !language) return;
    setBusy(true); setNote('');
    try {
      for (const text of texts) {
        if (trip.phrases.some((p) => p.text.toLowerCase() === text.toLowerCase())) continue;
        store.addPhrase(trip.id, text, await translateText(text, null, language));
      }
    } catch (e) { setNote(`The AI could not translate: ${String((e as Error)?.message || e).slice(0, 120)}`); }
    setBusy(false);
  };
  const openTranslator = () => { if (!trip) return; useTranslator.getState().set({ mode: 'text', to: trip.language }); navigation.navigate('Translator'); };
  const openCurrency = () => { if (!trip) return; useCurrency.getState().set({ from: trip.home, to: trip.currency }); navigation.navigate('Currency'); };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Trip kit" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        {store.trips.length > 1 && trip && (
          <Select label="Trip" options={store.trips.map((t) => ({ id: t.id, label: t.name }))} value={trip.id} onChange={store.select} testID="trip-pick" />
        )}
        <View style={styles.row}>
          <TextInput value={name} onChangeText={setName} maxLength={40} placeholder={trip ? 'Name of another trip' : 'Where are you going?'} placeholderTextColor={colors.textMuted} testID="trip-name"
            style={[styles.input, styles.grow, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          <Button title="Start" variant="outline" onPress={() => { store.start(name, trip?.language ?? 'es-ES', trip?.currency ?? 'EUR'); setName(''); }} disabled={!name.trim()} testID="trip-start" />
        </View>

        {trip && language && (
          <>
            <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="trip-title">{trip.name}</Text>
            <View style={styles.grid}>
              <View style={styles.half}><Select label="Language there" options={LANGUAGES} value={trip.language} onChange={(l) => store.update(trip.id, { language: l })} testID="trip-language" /></View>
              <View style={styles.half}><Select label="Money there" options={MONEY} value={trip.currency} onChange={(c) => store.update(trip.id, { currency: c })} testID="trip-currency" /></View>
              <View style={styles.half}><Select label="Money at home" options={MONEY} value={trip.home} onChange={(c) => store.update(trip.id, { home: c })} testID="trip-home" /></View>
            </View>
            <View style={styles.links}>
              <Button title="Translator" variant="outline" onPress={openTranslator} testID="trip-translator" />
              <Button title="Currency" variant="outline" onPress={openCurrency} testID="trip-money" />
              {LINKS.map((l) => (
                <TouchableOpacity key={l.route} onPress={() => navigation.navigate(l.route)} style={[styles.chip, { borderColor: colors.border }]} accessibilityRole="button" testID={`trip-link-${l.route}`}>
                  <Icon name={l.icon} size={16} color={colors.primary} /><Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>PHRASES IN {language.name.toUpperCase()}</Text>
            {trip.phrases.map((p) => (
              <View key={p.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`trip-phrase-${p.id}`}>
                <View style={styles.grow}>
                  <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>{p.translation}</Text>
                  <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>{p.text}</Text>
                </View>
                <TouchableOpacity onPress={() => { stopSpeech(); void speakInAndWait(p.translation, trip.language, { messageId: 'trip' }); }} accessibilityRole="button" accessibilityLabel={`Say ${p.text}`} testID={`trip-say-${p.id}`}><Icon name="volume-2" size={20} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => store.removePhrase(trip.id, p.id)} accessibilityRole="button" accessibilityLabel={`Remove ${p.text}`}><Icon name="x" size={18} color={colors.textMuted} /></TouchableOpacity>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput value={phrase} onChangeText={setPhrase} maxLength={120} placeholder="A phrase in your language" placeholderTextColor={colors.textMuted} testID="trip-phrase"
                style={[styles.input, styles.grow, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
              <Button title={busy ? '...' : 'Add'} variant="outline" onPress={() => { const text = phrase.trim(); setPhrase(''); void translateAll([text]); }} disabled={busy || !phrase.trim()} testID="trip-phrase-add" />
            </View>
            {trip.phrases.length === 0 && <Button title={busy ? 'Translating...' : 'Add the basics'} variant="outline" onPress={() => { void translateAll(BASIC_PHRASES); }} disabled={busy} testID="trip-basics" />}
            {!!note && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="trip-note">{note}</Text>}

            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>PACKING ({trip.packing.filter((p) => p.done).length} OF {trip.packing.length})</Text>
            {trip.packing.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => store.togglePack(trip.id, p.id)} onLongPress={() => store.removePack(trip.id, p.id)} style={styles.pack} accessibilityRole="checkbox" accessibilityState={{ checked: p.done }} testID={`trip-pack-${p.id}`}>
                <Icon name={p.done ? 'check-square' : 'square'} size={18} color={p.done ? colors.primary : colors.textMuted} />
                <Text style={{ color: p.done ? colors.textMuted : colors.text, ...TYPOGRAPHY.body, textDecorationLine: p.done ? 'line-through' : 'none' }}>{p.text}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.row}>
              <TextInput value={item} onChangeText={setItem} maxLength={80} placeholder="Something else to pack" placeholderTextColor={colors.textMuted} testID="trip-pack-input"
                style={[styles.input, styles.grow, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
              <Button title="Add" variant="outline" onPress={() => { store.addPack(trip.id, item); setItem(''); }} disabled={!item.trim()} testID="trip-pack-add" />
            </View>
            <Button title="Delete this trip" variant="outline" onPress={() => store.remove(trip.id)} testID="trip-delete" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  grow: { flex: 1 },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  half: { flexBasis: '48%', flexGrow: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  chip: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center', borderWidth: 1, borderRadius: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, minHeight: 44 },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md },
  pack: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, minHeight: 44 },
});
