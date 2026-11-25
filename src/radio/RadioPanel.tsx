import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { Select, type SelectOption } from '../components/Select';
import { keepSong, requestSong, setSleepTimer, skipSong, startRadio, stopRadio } from './service';
import { useRadioRun, useRadioSettings } from './store';
import { GENRES, SUBJECTS, TOPICS } from './tables';

const POEMS: SelectOption[] = [
  { id: '0.6', label: 'Often', hint: 'About 6 songs in 10 have a poem' },
  { id: '0.4', label: 'Sometimes', hint: 'About 4 songs in 10 have a poem' },
  { id: '0.2', label: 'Rarely', hint: 'About 2 songs in 10 have a poem' },
  { id: '0', label: 'Never', hint: 'Music only' },
];
const LENGTHS: SelectOption[] = [60, 120, 180, 240, 300].map((s) => ({ id: String(s), label: s === 60 ? 'Up to 1 minute' : `Up to ${s / 60} minutes` }));
const MOODS: SelectOption[] = [{ id: 'any', label: 'Any mood' }, { id: 'calm', label: 'Calm songs only', hint: 'Soft genres and gentle tunes, for sleep or reading' }];
const SLEEP: SelectOption[] = [{ id: '0', label: 'Off' }, ...[15, 30, 60, 90].map((m) => ({ id: String(m), label: `${m} minutes`, hint: 'The music fades out and the station stops' }))];
const HOST: SelectOption[] = [{ id: 'on', label: 'Says what is coming up' }, { id: 'off', label: 'Stays quiet' }];

/** What the station is doing now: the line (break or playing), the song, and the poem with its name while it is read. */
const NowCard: React.FC<{ run: ReturnType<typeof useRadioRun.getState> }> = ({ run }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="radio-now">
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="radio-line">{run.line.toUpperCase()}</Text>
      {!!run.title && <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="radio-title">{run.title}</Text>}
      {!!run.about && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{run.about}</Text>}
      {!!run.poem && run.reading && (
        <>
          {!!run.poemTitle && <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="radio-poem-title">{run.poemTitle}</Text>}
          <Text style={{ color: colors.text, ...TYPOGRAPHY.body }} testID="radio-poem">{run.poem.join('\n')}</Text>
        </>
      )}
      {!!run.poem && !run.reading && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="radio-poem-coming">{run.poemTitle ? `A poem is coming: ${run.poemTitle}.` : 'A poem is coming.'}</Text>}
    </View>
  );
};

/** The AI radio's controls and what it is doing now: say what the station is about, press Start, and it plays songs one after another with a poem read over some of them. Shown inside Music Studio. */
export const RadioPanel: React.FC = () => {
  const { colors } = useTheme();
  const settings = useRadioSettings();
  const run = useRadioRun();
  const poemId = settings.musicOnly ? '0' : String(settings.poemChance);
  const [wish, setWish] = React.useState('');
  const [wishNote, setWishNote] = React.useState('');
  const [sleep, setSleep] = React.useState('0');
  const ask = () => {
    const result = requestSong(wish);
    setWishNote(result === 'ok' ? 'The next song will be about that.' : result === 'unsuitable' ? 'The station will not play that. Try other words.' : '');
    if (result === 'ok') setWish('');
  };
  return (
    <>
      <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
        A station that never ends. Each song is rolled from {GENRES.length} genres, {TOPICS.length} topics and {SUBJECTS.length} subjects, the AI picks its instruments, and the tune plays over and over until the song is up. Some songs have a titled poem read once over the top, in a steady voice. Between songs there is a short break while the host says what is next and the AI writes it, so the AI never works while a song plays.
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
        <View style={styles.half}><Select label="Mood" options={MOODS} value={settings.calmOnly ? 'calm' : 'any'} onChange={(id) => settings.set({ calmOnly: id === 'calm' })} testID="radio-mood" /></View>
        <View style={styles.half}><Select label="Host" options={HOST} value={settings.host ? 'on' : 'off'} onChange={(id) => settings.set({ host: id === 'on' })} testID="radio-host" /></View>
      </View>
      <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>
        The theme makes matching genres, topics and subjects likelier and is passed to the AI. The AI that writes is the one chosen as the background model in Model settings; a small one is enough.
      </Text>
      {run.on ? (
        <View style={styles.row}>
          <Button title="Stop" onPress={stopRadio} testID="radio-stop" />
          <Button title="Next song" variant="outline" onPress={skipSong} testID="radio-skip" />
          <Button title={run.kept ? 'Kept' : 'Keep this song'} variant="outline" onPress={keepSong} disabled={run.kept || !run.title} testID="radio-keep" />
        </View>
      ) : <Button title="Start the radio" onPress={startRadio} testID="radio-start" />}
      {run.on && <NowCard run={run} />}
      {run.on && (
        <View style={styles.gap}>
          <Text style={{ color: colors.text, ...TYPOGRAPHY.body }}>Request a song</Text>
          <View style={styles.row}>
            <TextInput value={wish} onChangeText={setWish} maxLength={80} testID="radio-request" placeholder="e.g. a lost umbrella" placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.grow, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Button title="Ask" variant="outline" onPress={ask} disabled={!wish.trim()} testID="radio-request-go" />
          </View>
          {!!(run.request || wishNote) && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="radio-request-note">{run.request ? `Next song: ${run.request}` : wishNote}</Text>}
          <Select label="Sleep timer" options={SLEEP} value={sleep} onChange={(id) => { setSleep(id); setSleepTimer(Number(id) || null); }} testID="radio-sleep" />
          {run.sleepAt !== null && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="radio-sleep-note">{`The station stops at ${new Date(run.sleepAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}</Text>}
        </View>
      )}
      {!!run.problem && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="radio-problem">{run.problem}</Text>}
    </>
  );
};

const styles = StyleSheet.create({
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  half: { flexBasis: '48%', flexGrow: 1 },
  row: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  grow: { flex: 1 },
  gap: { gap: SPACING.sm },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, gap: SPACING.sm },
});
