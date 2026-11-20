import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme } from '../theme';
import { useMusicLibrary, deleteInstrumentalTrack, type InstrumentalTrack } from '../music/library';
import { instrumentalPlayer, useMusicPlayback } from '../music/backgroundPlayer';
import { shareItem } from '../utils/shareItem';
import { STYLES, composeStyled, type Energy, type StyleMood } from '../music/styles';
import { POPULAR, styleFromText } from '../music/simple';
import type { MusicScore } from '../music/composition';
import { saveAmbient, saveInstrumental } from '../music/saveTrack';
import { composeContinuation, composeMusic, composeVariation } from '../music/composerAgent';
import RNFS from 'react-native-fs';
import { pick as pickFiles, types } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { fromBase64 } from '../music/soundfontFiles';
import { fromMidi } from '../music/midiImport';
import { SoundfontCard } from '../music/SoundfontCard';
import { PRESETS } from '../music/presets';
import { MakePanel, type MakeChoices, type Maker } from '../music/MakePanel';
import { TrackList } from '../music/TrackList';
import { AMBIENT, type AmbientKind } from '../music/ambient';
import { SPACING } from '../constants';


/** Music Studio makes original instrumental music in a chosen style, played by a small band, entirely on the phone. */
export function MusicStudioScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [prompt, setPrompt] = useState('');
  const [mood, setMood] = useState<StyleMood>('focus');
  const [energy, setEnergy] = useState<Energy>('medium');
  const [duration, setDuration] = useState<number>(60);
  const [variant, setVariant] = useState(0);
  const [maker, setMaker] = useState<Maker>('ai');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [noise, setNoise] = useState<AmbientKind>(AMBIENT[0].id);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<MusicScore | null>(null);
  const [selected, setSelected] = useState('');
  // What the system is doing right now, in words, from the first tap until the sound is playing.
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState(0);
  const tracks = useMusicLibrary((s) => s.tracks);
  const looping = useMusicLibrary((s) => s.loop);
  const volume = useMusicLibrary((s) => s.volume);
  const playback = useMusicPlayback();
  const activeTrack = tracks.find((t) => t.id === selected) || tracks.find((t) => t.id === playback.current?.id) || null;
  const playing = playback.playing;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setPosition(instrumentalPlayer.position()), 500);
    return () => clearInterval(timer);
  }, [playing]);
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const play = async (track: InstrumentalTrack) => {
    try { await instrumentalPlayer.play(track); }
    catch (error: any) { Alert.alert('Playback failed', String(error?.message || error)); }
  };
  const saveScore = async (next: MusicScore, by?: string, seconds = duration): Promise<void> => {
    const track = await saveInstrumental(next, { mood, seconds, by, onStep: setStatus });
    setSelected(track.id);
    setScore(next);
    setStatus('Starting the player...');
    await play(track); // Crossfades if another track is playing; navigation does not stop it.
  };
  /** Makes a track: the tune for this style, energy and variant, played by the style's band. */
  const make = async (next: { mood?: StyleMood; variant?: number } = {}) => {
    if (busy) return;
    const useMood = next.mood ?? mood; const useVariant = next.variant ?? variant;
    setBusy(true);
    setStatus(`Writing a ${STYLES[useMood].label} tune...`);
    try { await saveScore(composeStyled(prompt, useMood, { variant: useVariant, energy })); }
    catch (error: any) { Alert.alert('Could not make the music', String(error?.message || error)); }
    finally { setBusy(false); setStatus(''); }
  };
  /** The hidden composer writes the tune with the on-phone AI and a long list of instruments; the built-in composer steps in if it cannot. */
  const askComposer = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Asking the AI composer to write the score (this can take a minute or two)...');
    try {
      const composed = await composeMusic(`${prompt} ${STYLES[mood].label}`.trim(), { seconds: duration, style: mood, instruments });
      setStatus(composed.via === 'composer' ? 'The composer wrote the score. Checking it against the key and chords...' : 'The AI could not write a usable score; using the built-in composer...');
      await saveScore(composed.score, composed.via === 'composer' ? 'Atlas composer' : 'built-in composer');
      if (composed.via === 'built-in') Alert.alert('Made with the built-in composer', composed.note);
    } catch (error: any) { Alert.alert('Could not make the music', String(error?.message || error)); }
    finally { setBusy(false); setStatus(''); }
  };
  /** How long a score plays, in whole seconds (a little past its last note), for rendering a tune whose length is not the chosen duration. */
  const secondsOf = (s: MusicScore): number => Math.min(300, Math.max(10, Math.ceil(Math.max(...s.notes.map((n) => n.beat + n.length)) * 60 / (s.bpm || 100)) + 2));
  /** Brings in a standard MIDI file: it becomes a saved track that can be played, edited, varied and extended like any other. */
  const importMidi = async () => {
    if (busy) return;
    try {
      const [file] = await pickFiles({ type: [types.allFiles], allowMultiSelection: false });
      if (!file) return;
      setBusy(true); setStatus('Reading the MIDI file...');
      const local = await resolvePickedFileUri(file.uri, file.name || 'tune.mid');
      const imported = fromMidi(fromBase64(await RNFS.readFile(local.replace(/^file:\/\//, ''), 'base64')), file.name || '');
      await saveScore(imported, 'imported MIDI file', secondsOf(imported));
    } catch (error: any) {
      if (!/cancel/i.test(String(error?.message || error)) && error?.code !== 'OPERATION_CANCELED') Alert.alert('Could not bring in the MIDI file', String(error?.message || error));
    } finally { setBusy(false); setStatus(''); }
  };
  /** A saved tune followed by a new contrasting section, saved as a new track. */
  const extendTune = async (track: InstrumentalTrack) => {
    if (busy) return;
    setBusy(true);
    setStatus(`Asking the AI composer for a next section of "${track.title}" (this can take a minute or two)...`);
    try {
      const saved = JSON.parse(await RNFS.readFile(track.scorePath, 'utf8'));
      if (!Array.isArray(saved?.notes) || !saved.notes.length) throw new Error('This track has no notes to continue.');
      const style = (STYLES[track.mood as StyleMood] ? track.mood : mood) as StyleMood;
      const composed = await composeContinuation(saved as MusicScore, { mood: style });
      await saveScore(composed.score, 'Atlas composer', secondsOf(composed.score));
    } catch (error: any) { Alert.alert('Could not extend the tune', String(error?.message || error)); }
    finally { setBusy(false); setStatus(''); }
  };
  /** A variation of a saved tune: same key and chords, a new melody, written by the composer from the saved score. */
  const makeVariation = async (track: InstrumentalTrack) => {
    if (busy) return;
    setBusy(true);
    setStatus(`Asking the AI composer for a variation of "${track.title}" (this can take a minute or two)...`);
    try {
      const saved = JSON.parse(await RNFS.readFile(track.scorePath, 'utf8'));
      if (!Array.isArray(saved?.notes) || !saved.notes.length) throw new Error('This track has no notes to vary (background sounds cannot be varied).');
      const style = (STYLES[track.mood as StyleMood] ? track.mood : mood) as StyleMood;
      const composed = await composeVariation(saved as MusicScore, { mood: style, seconds: track.seconds });
      await saveScore(composed.score, composed.via === 'composer' ? 'Atlas composer' : 'built-in composer', secondsOf(composed.score));
      if (composed.via === 'built-in') Alert.alert('Made with the built-in composer', composed.note);
    } catch (error: any) { Alert.alert('Could not make a variation', String(error?.message || error)); }
    finally { setBusy(false); setStatus(''); }
  };
  /** Makes a background sound (white noise, rain...) and plays it on a loop. */
  const makeAmbientTrack = async (kind: AmbientKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const track = await saveAmbient(kind, 90, setStatus);
      setSelected(track.id);
      useMusicLibrary.getState().setLoop(true);
      setStatus('Starting the player...');
      await play(track);
    } catch (error: any) { Alert.alert('Could not make the sound', String(error?.message || error)); }
    finally { setBusy(false); setStatus(''); }
  };
  const another = () => { setVariant(variant + 1); return make({ variant: variant + 1 }); };
  const surprise = () => {
    const pick = POPULAR[Math.floor(Math.random() * POPULAR.length)];
    setMood(pick); setVariant(0); return make({ mood: pick, variant: 0 });
  };
  const describe = (text: string) => {
    setPrompt(text);
    const found = styleFromText(text);
    if (found) { setMood(found); setVariant(0); }
  };

  const togglePlayer = async () => {
    if (playback.playing) { instrumentalPlayer.pause(); return; }
    if (playback.paused && playback.current?.id === activeTrack?.id) {
      try { await instrumentalPlayer.resume(); } catch (e: any) { Alert.alert('Could not resume', String(e?.message || e)); }
      return;
    }
    if (activeTrack) await play(activeTrack);
  };
  const changeVolume = (delta: number) => instrumentalPlayer.setVolume(Math.round((volume + delta) * 10) / 10);
  const remove = (track: InstrumentalTrack) => Alert.alert('Delete instrumental?', `Permanently delete ${track.title} from this device?`, [
    { text: 'Cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => {
      if (playback.current?.id === track.id) instrumentalPlayer.stop();
      deleteInstrumentalTrack(track).catch((e) => Alert.alert('Could not delete', String(e?.message || e)));
      if (selected === track.id) setSelected('');
    } },
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const useSoundfont = useMusicLibrary((st) => st.useSoundfont);
  const soundfont = useMusicLibrary((st) => st.soundfont);
  const background = useMusicLibrary((st) => st.background);
  const choices: MakeChoices = { prompt, mood, energy, seconds: duration, maker, instruments, noise, sound: useSoundfont && soundfont ? 'soundfont' : 'synth' };
  const change = (patch: Partial<MakeChoices>) => {
    if (patch.prompt !== undefined) describe(patch.prompt);
    if (patch.mood !== undefined) { setMood(patch.mood); setVariant(0); }
    if (patch.energy !== undefined) setEnergy(patch.energy);
    if (patch.seconds !== undefined) setDuration(patch.seconds);
    if (patch.maker !== undefined) setMaker(patch.maker);
    if (patch.instruments !== undefined) setInstruments(patch.instruments);
    if (patch.noise !== undefined) setNoise(patch.noise);
    if (patch.sound !== undefined) useMusicLibrary.getState().setUseSoundfont(patch.sound === 'soundfont');
  };
  const makeIt = () => (maker === 'ai' ? askComposer() : maker === 'quick' ? make() : makeAmbientTrack(noise));
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Music Studio" />
      <ScrollView contentContainerStyle={styles.body}>
        <MakePanel choices={choices} onChange={change} soundfontName={soundfont?.name} busy={busy} onMake={makeIt} onSurprise={surprise} onImport={() => { void importMidi(); }} onOwn={(id) => { const preset = PRESETS.find((x) => x.id === id); if (preset) navigation.navigate('ScoreEditor', { score: preset.build() }); }} />
        {!!status && <View style={styles.statusRow} testID="music-status"><ActivityIndicator color={colors.primary} /><Text style={[styles.statusText, { color: colors.text }]}>{status}</Text></View>}
        {!!playback.error && <Text style={{ color: colors.error }} testID="music-playback-error">{playback.error}</Text>}

        <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-persistent-player">
          <Text style={[styles.title, { color: colors.text }]}>Now playing</Text>
          <Text style={{ color: colors.textSecondary }}>{playback.current?.title || 'Choose or make a track'}</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]} testID="music-player-state">{playback.error ? 'Could not play it.' : playback.loading ?? (playing ? `Playing ${clock(position)} of ${clock(playback.current?.seconds ?? 0)}` : playback.paused ? 'Paused' : 'Stopped')}</Text>
          <View style={styles.options}>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.previous().catch((e) => Alert.alert('Playback', String(e)))} accessibilityLabel="Previous instrumental" testID="music-previous"><Icon name="skip-back" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={togglePlayer} disabled={!activeTrack} accessibilityLabel={playing ? 'Pause instrumental' : 'Play instrumental'} testID="music-play-pause"><Icon name={playing ? 'pause' : 'play'} size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.next().catch((e) => Alert.alert('Playback', String(e)))} accessibilityLabel="Next instrumental" testID="music-next"><Icon name="skip-forward" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.stop()} accessibilityLabel="Stop instrumental" testID="music-stop"><Icon name="square" size={18} color={colors.primary} /></TouchableOpacity>
          </View>
        </View>

        {!!score && <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-result">
          <Text style={[styles.title, { color: colors.text }]}>{score.title}</Text>
          <Text style={{ color: colors.textSecondary }}>{Math.round(score.bpm)} BPM · saved on this phone</Text>
          <TouchableOpacity onPress={another} disabled={busy} testID="music-another" style={[styles.action, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Make another version</Text></TouchableOpacity>
        </View>}

        <Text style={[styles.title, { color: colors.text }]}>My tracks ({tracks.length})</Text>
        <Text style={[styles.small, { color: colors.textMuted }]}>Tap to play. Swipe a track sideways, or press and hold it, for delete, share, edit notes, variation and continue.</Text>
        <TrackList tracks={tracks} activeId={activeTrack?.id} playingId={playback.playing ? playback.current?.id : undefined} busy={busy}
          onPlay={(t) => { setSelected(t.id); void play(t); }} onShare={(t) => { void shareItem({ title: t.title, file: t.path }); }}
          onEdit={(t) => navigation.navigate('ScoreEditor', { scorePath: t.scorePath })} onVariation={(t) => { void makeVariation(t); }} onContinue={(t) => { void extendTune(t); }} onDelete={remove} />

        <TouchableOpacity onPress={() => setSettingsOpen((v) => !v)} accessibilityRole="button" testID="music-settings-toggle" style={styles.settingsToggle}>
          <Text style={[styles.title, { color: colors.text }]}>Sound and playback</Text>
          <Icon name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {settingsOpen && (
          <View style={styles.settings} testID="music-settings">
            <View style={styles.switchRow}>
              <View style={styles.flex}><Text style={{ color: colors.text }}>Keep playing in the background</Text><Text style={[styles.small, { color: colors.textMuted }]}>The music goes on when you leave Atlas or close it, with controls in the phone's media player.</Text></View>
              <Switch value={background} onValueChange={(on) => useMusicLibrary.getState().setBackground(on)} accessibilityLabel="Keep playing in the background" testID="music-background-toggle" />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.flex, { color: colors.text }]}>Repeat the track</Text>
              <Switch value={looping} onValueChange={(on) => instrumentalPlayer.setLoop(on)} accessibilityLabel="Repeat the track" testID="music-loop-toggle" />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.flex, { color: colors.text }]}>Volume {Math.round(volume * 100)}%</Text>
              <TouchableOpacity style={styles.option} onPress={() => changeVolume(-0.1)} accessibilityLabel="Lower music volume" testID="music-volume-down"><Icon name="volume-1" size={18} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity style={styles.option} onPress={() => changeVolume(0.1)} accessibilityLabel="Raise music volume" testID="music-volume-up"><Icon name="volume-2" size={18} color={colors.text} /></TouchableOpacity>
            </View>
            <SoundfontCard />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderRadius: 18, padding: 10 },
  action: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginVertical: 3 },
  small: { fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  statusText: { flex: 1 },
  result: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 7 },
  flex: { flex: 1 },
  settingsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  settings: { gap: SPACING.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
});
