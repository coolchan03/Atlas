import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { Select, type SelectOption } from '../components/Select';
import { useWideLayout } from '../hooks/useWideLayout';
import { skipSong, startRadio, stopRadio } from './service';
import { useRadioRun, useRadioSettings } from './store';
import { GENRES, SUBJECTS, TOPICS } from './tables';

const POEMS: SelectOption[] = [
  { id: '0.6', label: 'Often', hint: 'About 6 songs in 10 have a poem' },
  { id: '0.4', label: 'Sometimes', hint: 'About 4 songs in 10 have a poem' },
  { id: '0.2', label: 'Rarely', hint: 'About 2 songs in 10 have a poem' },
  { id: '0', label: 'Never', hint: 'Music only' },
];
const LENGTHS: SelectOption[] = [60, 120, 180, 240, 300].map((s) => ({ id: String(s), label: s === 60 ? 'Up to 1 minute' : `Up to ${s / 60} minutes` }));
const HOST: SelectOption[] = [{ id: 'on', label: 'Says what is coming up' }, { id: 'off', label: 'Stays quiet' }];

/** The AI radio: say what the station is about, press Start, and it plays songs one after another with a poem read over some of them. */
export const RadioScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout();
  const settings = useRadioSettings();
  const run = useRadioRun();
  const poemId = settings.musicOnly ? '0' : String(settings.poemChance);
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="AI radio" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
          A station that never ends. Each song is rolled from {GENRES.length} genres, {TOPICS.length} topics and {SUBJECTS.length} subjects, the AI picks its instruments, and the tune plays over and over until the song is up. Some songs have a poem read once over the top, in a steady voice.
        </Text>
        <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>Station theme</Text>
        <TextInput
          value={settings.theme} onChangeText={(theme) => settings.set({ theme })} multiline maxLength={160} testID="radio-theme"
          placeholder="e.g. a haunted lighthouse's late-night station" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <TextInput
          value={settings.stationName} onChangeText={(stationName) => settings.set({ stationName })} maxLength={40} testID="radio-name" placeholder="Station name" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <View style={styles.grid}>
          <View style={styles.half}><Select label="Poems" options={POEMS} value={poemId} onChange={(id) => settings.set({ musicOnly: id === '0', ...(id === '0' ? {} : { poemChance: Number(id) }) })} testID="radio-poems" /></View>
          <View style={styles.half}><Select label="Song length" options={LENGTHS} value={String(settings.maxSongSeconds)} onChange={(id) => settings.set({ maxSongSeconds: Number(id) })} testID="radio-length" /></View>
          <View style={styles.half}><Select label="Host" options={HOST} value={settings.host ? 'on' : 'off'} onChange={(id) => settings.set({ host: id === 'on' })} testID="radio-host" /></View>
        </View>
        <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>
          The theme makes matching genres, topics and subjects likelier and is passed to the AI. The AI that writes is the one chosen as the background model in Model settings; a small one is enough.
        </Text>
        {run.on ? (
          <View style={styles.row}>
            <Button title="Stop" onPress={stopRadio} testID="radio-stop" />
            <Button title="Next song" variant="outline" onPress={skipSong} testID="radio-skip" />
          </View>
        ) : <Button title="Start the radio" onPress={startRadio} testID="radio-start" />}
        {run.on && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="radio-now">
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="radio-line">{run.line.toUpperCase()}</Text>
            {!!run.title && <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="radio-title">{run.title}</Text>}
            {!!run.about && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{run.about}</Text>}
            {!!run.poem && run.reading && <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="radio-poem">{run.poem.join('\n')}</Text>}
            {!!run.poem && !run.reading && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>A poem is coming.</Text>}
          </View>
        )}
        {!!run.problem && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="radio-problem">{run.problem}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  half: { flexBasis: '48%', flexGrow: 1 },
  row: { flexDirection: 'row', gap: SPACING.md },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, gap: SPACING.sm },
});
