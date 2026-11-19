import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme } from '../theme';
import { useMusicLibrary, deleteInstrumentalTrack, type InstrumentalTrack } from '../music/library';
import { instrumentalPlayer, useMusicPlayback } from '../music/backgroundPlayer';
import { shareItem } from '../utils/shareItem';
import { STYLES, composeStyled, type Energy, type StyleGroup, type StyleMood } from '../music/styles';
import { POPULAR, instrumentsOf, styleFromText } from '../music/simple';
import type { MusicScore } from '../music/composition';
import { saveAmbient, saveInstrumental } from '../music/saveTrack';
import { composeMusic, composeVariation } from '../music/composerAgent';
import RNFS from 'react-native-fs';
import { SoundfontCard } from '../music/SoundfontCard';
import { AMBIENT, type AmbientKind } from '../music/ambient';
import { SPACING } from '../constants';

const ENERGIES: Array<{ id: Energy; label: string }> = [{ id: 'calm', label: 'Calm' }, { id: 'medium', label: 'Medium' }, { id: 'lively', label: 'Lively' }];
const GROUPS: StyleGroup[] = ['Moods and genres', 'Eras and genres', 'Seasons and holidays', 'Places and settings'];
const ALL_STYLES = Object.keys(STYLES) as StyleMood[];
const DURATIONS = [30, 60, 90] as const;

/** Music Studio makes original instrumental music in a chosen style, played by a small band, entirely on the phone. */
export function MusicStudioScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [prompt, setPrompt] = useState('');
  const [mood, setMood] = useState<StyleMood>('focus');
  const [energy, setEnergy] = useState<Energy>('medium');
  const [duration, setDuration] = useState<number>(60);
  const [variant, setVariant] = useState(0);
  const [more, setMore] = useState(false);
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
  const saveScore = async (next: MusicScore, by?: string): Promise<void> => {
    const track = await saveInstrumental(next, { mood, seconds: duration, by, onStep: setStatus });
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
      const composed = await composeMusic(`${prompt} ${STYLES[mood].label}`.trim(), { seconds: duration, style: mood });
      setStatus(composed.via === 'composer' ? 'The composer wrote the score. Checking it against the key and chords...' : 'The AI could not write a usable score; using the built-in composer...');
      await saveScore(composed.score, composed.via === 'composer' ? 'Atlas composer' : 'built-in composer');
      if (composed.via === 'built-in') Alert.alert('Made with the built-in composer', composed.note);
    } catch (error: any) { Alert.alert('Could not make the music', String(error?.message || error)); }
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
      await saveScore(composed.score, composed.via === 'composer' ? 'Atlas composer' : 'built-in composer');
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
  const option = (active: boolean) => ({
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: active ? colors.primary : colors.surface,
  });
  const chips = <T extends string | number>(values: Array<{ id: T; label: string }>, current: T, change: (value: T) => void) => (
    <View style={styles.options}>{values.map((v) => (
      <TouchableOpacity key={String(v.id)} onPress={() => change(v.id)} disabled={busy} accessibilityRole="radio"
        accessibilityState={{ selected: v.id === current }} style={[styles.option, option(v.id === current)]}>
        <Text style={{ color: v.id === current ? colors.background : colors.text }}>{v.label}</Text>
      </TouchableOpacity>
    ))}</View>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Music Studio" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={{ color: colors.textSecondary }}>Tell the AI composer what to write, pick a style, and a small band plays an original tune. Everything stays on this phone.</Text>
        <Text style={[styles.label, { color: colors.text }]}>What should the AI composer write?</Text>
        <TextInput value={prompt} onChangeText={describe} multiline maxLength={200} testID="music-prompt"
          placeholder="e.g. a rainy day jazz cafe, slow, with piano, upright bass and a saxophone" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <Text style={[styles.small, { color: colors.textSecondary }]}>Your words guide the style, the mood and which instruments it picks. Leave it empty and the composer chooses for you.</Text>
        <Text style={[styles.label, { color: colors.text }]}>Style</Text>
        {chips(POPULAR.map((id) => ({ id, label: STYLES[id].label })), mood, (id: StyleMood) => { setMood(id); setVariant(0); })}
        <TouchableOpacity onPress={() => setMore((v) => !v)} accessibilityRole="button" testID="music-more-styles"><Text style={{ color: colors.primary }}>{more ? 'Fewer styles' : `More styles (${ALL_STYLES.length - POPULAR.length})`}</Text></TouchableOpacity>
        {more && GROUPS.map((group) => (
          <View key={group}>
            <Text style={[styles.small, { color: colors.textSecondary }]}>{group}</Text>
            {chips(ALL_STYLES.filter((id) => STYLES[id].group === group && !POPULAR.includes(id)).map((id) => ({ id, label: STYLES[id].label })), mood, (id: StyleMood) => { setMood(id); setVariant(0); })}
          </View>
        ))}
        <Text style={[styles.small, { color: colors.textSecondary }]} testID="music-plays">{STYLES[mood].label} plays: {instrumentsOf(mood)}.</Text>
        <Text style={[styles.label, { color: colors.text }]}>How lively</Text>
        {chips(ENERGIES, energy, setEnergy)}
        <Text style={[styles.label, { color: colors.text }]}>Length</Text>
        {chips(DURATIONS.map((n) => ({ id: n, label: `${n} seconds` })), duration, setDuration)}
        <View style={styles.options}>
          <TouchableOpacity onPress={askComposer} disabled={busy} testID="music-ai-composer" style={[styles.action, styles.grow, { borderColor: colors.primary }]}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Compose with AI</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => make()} disabled={busy} testID="music-quick" style={[styles.action, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>Quick tune (no AI)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={surprise} disabled={busy} testID="music-surprise" style={[styles.action, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>Surprise me</Text>
          </TouchableOpacity>
        </View>
        {!!status && <View style={styles.statusRow} testID="music-status"><ActivityIndicator color={colors.primary} /><Text style={[styles.statusText, { color: colors.text }]}>{status}</Text></View>}
        {!!playback.error && <Text style={{ color: colors.error }} testID="music-playback-error">{playback.error}</Text>}
        <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-ambient">
          <Text style={[styles.title, { color: colors.text }]}>Background sounds</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>Not music: steady sounds for focus, sleep or covering noise. They loop without a break, play like any track, and are saved in your list.</Text>
          <View style={styles.options}>
            {AMBIENT.map((a) => (
              <TouchableOpacity key={a.id} onPress={() => makeAmbientTrack(a.id)} disabled={busy} accessibilityLabel={`Make ${a.label}`} testID={`music-ambient-${a.id}`}
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.small, { color: colors.textMuted }]}>{AMBIENT.map((a) => `${a.label}: ${a.note}`).join(' ')}</Text>
        </View>
        <SoundfontCard />
        <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-persistent-player">
          <Text style={[styles.title, { color: colors.text }]}>Now playing</Text>
          <Text style={{ color: colors.textSecondary }}>{playback.current?.title || 'Choose or create an instrumental'}</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]} testID="music-player-state">{playback.error ? 'Could not play it.' : playback.loading ?? (playing ? `Playing ${clock(position)} of ${clock(playback.current?.seconds ?? 0)}${playback.ducked ? ' (softened while Atlas speaks)' : ''}` : playback.paused ? `Paused at ${clock(position)}` : 'Stopped')}</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>Music continues when you switch Atlas screens. It softens while Atlas speaks, and pauses when the app is backgrounded or a call interrupts audio.</Text>
          <View style={styles.options}>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.previous().catch((e) => Alert.alert('Playback', String(e)))} accessibilityLabel="Previous instrumental" testID="music-previous"><Icon name="skip-back" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={togglePlayer} disabled={!activeTrack} accessibilityLabel={playing ? 'Pause instrumental' : 'Play instrumental'} testID="music-preview"><Icon name={playing ? 'pause' : 'play'} size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.next().catch((e) => Alert.alert('Playback', String(e)))} accessibilityLabel="Next instrumental" testID="music-next"><Icon name="skip-forward" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={() => instrumentalPlayer.stop()} accessibilityLabel="Stop instrumental" testID="music-stop"><Icon name="square" size={18} color={colors.primary} /></TouchableOpacity>
          </View>
          <View style={styles.options}>
            <TouchableOpacity style={styles.option} onPress={() => changeVolume(-0.1)} accessibilityLabel="Lower music volume" testID="music-volume-down"><Icon name="volume-1" size={18} color={colors.text} /></TouchableOpacity>
            <Text style={[styles.centered, { color: colors.text }]}>Volume {Math.round(volume * 100)}%</Text>
            <TouchableOpacity style={styles.option} onPress={() => changeVolume(0.1)} accessibilityLabel="Raise music volume" testID="music-volume-up"><Icon name="volume-2" size={18} color={colors.text} /></TouchableOpacity>
            <TouchableOpacity onPress={() => instrumentalPlayer.setLoop(!looping)} accessibilityRole="checkbox" accessibilityState={{ checked: looping }} style={styles.option} testID="music-loop-toggle"><Text style={{ color: colors.text }}>{looping ? 'Loop: on' : 'Loop: off'}</Text></TouchableOpacity>
          </View>
        </View>
        {!!score && <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-result">
          <Text style={[styles.title, { color: colors.text }]}>{score.title}</Text>
          <Text style={{ color: colors.textSecondary }}>{score.bpm} BPM · {duration} seconds · saved on this phone</Text>
          <TouchableOpacity onPress={another} disabled={busy} testID="music-another" style={[styles.action, { borderColor: colors.primary }]}><Text style={{ color: colors.primary }}>Make another version</Text></TouchableOpacity>
        </View>}
        <Text style={[styles.title, { color: colors.text }]}>My instrumentals ({tracks.length})</Text>
        {!tracks.length && <Text style={{ color: colors.textSecondary }}>Create a track to build your offline playlist.</Text>}
        {tracks.map((track) => (
          <View key={track.id} style={[styles.result, { backgroundColor: colors.surface, borderColor: activeTrack?.id === track.id ? colors.primary : colors.border }]}>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setSelected(track.id); play(track); }} testID={`music-track-${track.id}`}>
              <Text style={[styles.label, { color: colors.text }]}>{track.title}</Text>
              <Text style={[styles.small, { color: colors.textSecondary }]}>{STYLES[track.mood as StyleMood]?.label ?? track.mood} · {track.seconds}s {playback.current?.id === track.id && playback.playing ? '· Playing' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Share ${track.title}`} testID={`music-share-${track.id}`} onPress={() => { void shareItem({ title: track.title, file: track.path }); }} style={styles.end}><Text style={{ color: colors.primary }}>Share</Text></TouchableOpacity>
            {!!track.scorePath && <TouchableOpacity accessibilityLabel={`Edit notes of ${track.title}`} testID={`music-edit-${track.id}`} onPress={() => navigation.navigate('ScoreEditor', { scorePath: track.scorePath })} style={styles.end}><Text style={{ color: colors.primary }}>Edit notes</Text></TouchableOpacity>}
            {!!track.scorePath && track.mood !== 'ambient' && <TouchableOpacity accessibilityLabel={`Make a variation of ${track.title}`} testID={`music-variation-${track.id}`} onPress={() => { void makeVariation(track); }} disabled={busy} style={styles.end}><Text style={{ color: colors.primary }}>Variation</Text></TouchableOpacity>}
            <TouchableOpacity accessibilityLabel={`Delete ${track.title}`} onPress={() => remove(track)} style={styles.end}><Text style={{ color: colors.error }}>Delete</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  input: { minHeight: 95, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderRadius: 18, padding: 10 },
  grow: { flexGrow: 1 },
  action: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginVertical: 3 },
  label: { fontWeight: '600' },
  small: { fontSize: 12 },
  centered: { alignSelf: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  statusText: { flex: 1 },
  end: { alignSelf: 'flex-end', marginTop: 6 },
  result: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 7 },
});
