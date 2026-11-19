import { SPACING, TYPOGRAPHY } from '../constants';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme } from '../theme';
import { toBase64 } from '../atlasVoice/jingles';
import { shareItem } from '../utils/shareItem';
import { instrumentalPlayer } from '../music/backgroundPlayer';
import { saveInstrumental } from '../music/saveTrack';
import { VOICE_LIST, instrumentOf, setInstrument, shiftAll, setTempo, toMidi, toggleDrum, toggleNote, transpose } from '../music/editor';
import { DrumGrid, PianoRoll, pitchName } from '../music/ScoreGrid';
import type { MusicRole, MusicScore, Voice } from '../music/types';

type Tab = 'melody' | 'pad' | 'bass' | 'drums';
const TABS: Array<{ id: Tab; label: string }> = [{ id: 'melody', label: 'Melody' }, { id: 'pad', label: 'Pad' }, { id: 'bass', label: 'Bass' }, { id: 'drums', label: 'Drums' }];
const START_TOP: Record<'melody' | 'pad' | 'bass', number> = { melody: 79, pad: 71, bass: 55 };
const ROWS = 14;
const UNDO_DEPTH = 30;

/** Edit a tune by hand: tap notes on a piano roll or drum grid, pick an instrument for each part, change the tempo, hear it, save it, or export it as MIDI. */
export function ScoreEditorScreen({ route }: { route: { params: { scorePath?: string; score?: MusicScore } } }) {
  const { colors } = useTheme();
  const [score, setScore] = useState<MusicScore | null>(route.params.score ?? null);
  const [undo, setUndo] = useState<MusicScore[]>([]);
  const [tab, setTab] = useState<Tab>('melody');
  const [top, setTop] = useState(START_TOP);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (score || !route.params.scorePath) return;
    RNFS.readFile(route.params.scorePath, 'utf8').then((t) => setScore(JSON.parse(t) as MusicScore)).catch(() => Alert.alert('Could not open the tune', 'Its notes could not be read.'));
  }, [route.params.scorePath]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!score) return <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}><ScreenHeader title="Edit notes" /><ActivityIndicator color={colors.primary} /></SafeAreaView>;

  const change = (next: MusicScore) => { setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), score]); setScore(next); };
  const part = tab === 'drums' ? null : tab;
  const chip = (label: string, on: boolean, onPress: () => void, testID?: string) => ( // eslint-disable-line max-params
    <TouchableOpacity key={label} onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.surface : undefined }]}>
      <Text style={{ color: on ? colors.primary : colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
  const run = async (label: string, work: () => Promise<void>) => { setBusy(label); try { await work(); } catch (e: any) { Alert.alert('Not done', String(e?.message || e)); } finally { setBusy(''); } };
  const save = (play: boolean) => run(play ? 'Making the sound...' : 'Saving...', async () => {
    const track = await saveInstrumental(score, { mood: 'focus', seconds: Math.max(10, Math.min(120, Math.ceil(score.notes.reduce((m, n) => Math.max(m, n.beat + n.length), 0) * 60 / score.bpm) + 2)), by: 'Score editor' });
    if (play) await instrumentalPlayer.play(track);
  });
  const exportMidi = () => run('Writing the MIDI file...', async () => {
    const path = `${RNFS.CachesDirectoryPath}/${(score.title || 'tune').replace(/[^\w-]+/g, '_').slice(0, 40)}.mid`;
    await RNFS.writeFile(path, toBase64(toMidi(score)), 'base64');
    await shareItem({ title: score.title, file: path });
  });

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Edit notes" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{score.title}</Text>
        <View style={styles.wrap}>
          {TABS.map((t) => chip(t.label, tab === t.id, () => setTab(t.id), `tab-${t.id}`))}
        </View>
        {part && (
          <>
            <Text style={{ color: colors.textSecondary }}>Instrument for the {part}: {instrumentOf(score, part) ?? 'the style band'}</Text>
            <ScrollView horizontal testID="instrument-picker"><View style={styles.wrap}>{VOICE_LIST.map((v: Voice) => chip(v, instrumentOf(score, part) === v, () => change(setInstrument(score, part, v)), `voice-${v}`))}</View></ScrollView>
            <View style={styles.wrap}>
              {chip(`Higher ▲ (${pitchName(top[part])})`, false, () => setTop({ ...top, [part]: Math.min(108, top[part] + 6) }), 'roll-up')}
              {chip('Lower ▼', false, () => setTop({ ...top, [part]: Math.max(24 + ROWS, top[part] - 6) }), 'roll-down')}
            </View>
            <PianoRoll score={score} role={part as MusicRole} top={top[part]} rows={ROWS} onTap={(pitch, beat) => change(toggleNote(score, { role: part, pitch, beat }))} />
          </>
        )}
        {!part && <DrumGrid score={score} onTap={(kind, beat) => change(toggleDrum(score, kind, beat))} />}
        <View style={styles.wrap}>
          {chip(`Tempo − (${score.bpm})`, false, () => change(setTempo(score, score.bpm - 5)), 'tempo-down')}
          {chip('Tempo +', false, () => change(setTempo(score, score.bpm + 5)), 'tempo-up')}
          {chip('Transpose −1', false, () => change(transpose(score, -1)), 'transpose-down')}
          {chip('Transpose +1', false, () => change(transpose(score, 1)), 'transpose-up')}
          {chip('Shift later', false, () => change(shiftAll(score, 0.25)), 'shift')}
          {chip('Undo', false, () => { const prev = undo[undo.length - 1]; if (prev) { setScore(prev); setUndo(undo.slice(0, -1)); } }, 'undo')}
        </View>
        {!!busy && <View style={styles.wrap}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary }}>{busy}</Text></View>}
        <View style={styles.wrap}>
          {chip('Play', false, () => { void save(true); }, 'play')}
          {chip('Save', false, () => { void save(false); }, 'save')}
          {chip('Export MIDI', false, () => { void exportMidi(); }, 'export-midi')}
        </View>
        <Text style={[styles.small, { color: colors.textMuted }]}>{score.notes.length} notes. Tap a square to add a note, tap it again to remove it. Play and Save make a new track in My instrumentals; your original stays as it was.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPOGRAPHY.h2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: SPACING.xl, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  small: { ...TYPOGRAPHY.meta },
});
