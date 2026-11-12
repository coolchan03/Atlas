import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/Feather';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme } from '../theme';
import { llmService } from '../services';
import { useMusicLibrary, deleteInstrumentalTrack, type InstrumentalTrack } from '../music/library';
import { instrumentalPlayer, useMusicPlayback } from '../music/backgroundPlayer';
import { wavBytes, toBase64 } from '../atlasVoice/jingles';
import { STYLES, type StyleGroup, type StyleMood } from '../music/styles';
import { composeInstrumental, parseMusicScore, renderMusic, type MusicMood, type MusicScore, type SoundPreset } from '../music/composition';

const makeMessage = (role: 'system' | 'user', content: string) => ({ id: `${role}-${Date.now()}`, role, content, timestamp: Date.now() });
const SOUND: Array<{ id: SoundPreset; label: string }> = [
  { id: 'keys', label: 'Soft keys' }, { id: 'ambient', label: 'Warm pads' },
  { id: 'bell', label: 'Bells' }, { id: 'synth', label: 'Synth' },
];
const BASIC_MOODS: Array<{ id: MusicMood; label: string }> = [
  { id: 'study', label: 'Focus' }, { id: 'ambient', label: 'Ambient' },
  { id: 'cinematic', label: 'Cinematic' }, { id: 'electronic', label: 'Electronic' },
];
const STYLE_GROUPS: Array<{ title: StyleGroup; items: Array<{ id: MusicMood; label: string }> }> = (['Moods and genres', 'Eras and genres', 'Seasons and holidays', 'Places and settings'] as const)
  .map((title) => ({
    title,
    items: [
      ...(title === 'Moods and genres' ? BASIC_MOODS : []),
      ...(Object.keys(STYLES) as StyleMood[]).filter((id) => STYLES[id].group === title).map((id) => ({ id: id as MusicMood, label: STYLES[id].label })),
    ],
  }));
const DURATIONS = [30, 60, 90] as const;

/** Music Studio makes original instrumental background music, not singing, audio samples or covers. */
export function MusicStudioScreen() {
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState('Peaceful, unobtrusive background music for reading');
  const [sound, setSound] = useState<SoundPreset>('ambient');
  const [mood, setMood] = useState<MusicMood>('study');
  const [duration, setDuration] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<MusicScore | null>(null);
  const [file, setFile] = useState('');
  const [selected, setSelected] = useState('');
  const tracks = useMusicLibrary((s) => s.tracks);
  const looping = useMusicLibrary((s) => s.loop);
  const volume = useMusicLibrary((s) => s.volume);
  const playback = useMusicPlayback();
  const activeTrack = tracks.find((t) => t.id === selected) || tracks.find((t) => t.id === playback.current?.id) || null;
  const playing = playback.playing;
  const play = async (track: InstrumentalTrack) => {
    try { await instrumentalPlayer.play(track); }
    catch (error: any) { Alert.alert('Playback failed', String(error?.message || error)); }
  };
  const saveScore = async (next: MusicScore): Promise<void> => {
    const pcm = renderMusic(next, { preset: sound, seconds: duration });
    const dir = `${RNFS.DocumentDirectoryPath}/atlas-compositions`;
    await RNFS.mkdir(dir);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${dir}/instrumental-${id}.wav`;
    const scorePath = `${dir}/instrumental-${id}.json`;
    try {
      await RNFS.writeFile(path, toBase64(wavBytes(pcm, 16000)), 'base64');
      await RNFS.writeFile(scorePath, JSON.stringify({ ...next, mood, sound, duration }, null, 2), 'utf8');
    } catch (error) {
      await RNFS.unlink(path).catch(() => undefined);
      await RNFS.unlink(scorePath).catch(() => undefined);
      throw error;
    }
    const track: InstrumentalTrack = { id, title: next.title, path, scorePath, mood, sound, seconds: duration, createdAt: new Date().toISOString() };
    useMusicLibrary.getState().addTrack(track);
    setSelected(id);
    setScore(next);
    setFile(path);
    await play(track); // Crossfades if another track is playing; navigation does not stop it.
  };
  const quick = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try { await saveScore(composeInstrumental(prompt, mood)); }
    catch (error: any) { Alert.alert('Could not compose', String(error?.message || error)); }
    finally { setBusy(false); }
  };
  const composeWithAI = async () => {
    if (!prompt.trim() || busy) return;
    if (!llmService.isModelLoaded()) {
      Alert.alert('Load a text model', 'Choose a local text model in Atlas to compose a custom arrangement, or tap Create instantly for a model-free track.');
      return;
    }
    if (llmService.isCurrentlyGenerating()) {
      Alert.alert('Model is busy', 'Finish the current generation before composing.'); return;
    }
    setBusy(true);
    try {
      const rules = `Compose ORIGINAL INSTRUMENTAL BACKGROUND MUSIC only; no singing, vocals, lyrics, existing songs, or artist imitations. Use ${mood} mood. Return only this exact score grammar, one item per line:\nTITLE: brief title\nBPM: integer 60-150\nNOTE C4 0 1 0.35 pad\nNOTE E4 1 1 0.7 melody\nNOTE C3 0 4 0.25 bass\nWrite 35-100 NOTE lines. Starts are absolute beats 0-32; duration 0.25-4 beats, gain 0.1-1. Roles are pad, bass and melody. Use layered chords plus an interesting but restrained melody. Keep the whole motif within 36 beats, to be repeated seamlessly. No markdown and no other text.`;
      const output = await llmService.generateResponse([makeMessage('system', rules), makeMessage('user', prompt)], { disableThinking: true });
      await saveScore(parseMusicScore(output));
    } catch (error: any) {
      Alert.alert('AI arrangement was not playable', `${String(error?.message || error)}\n\nUse Create instantly to generate a reliable instrumental track without the model.`);
    } finally { setBusy(false); }
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
      <ScreenHeader title="Instrumental Music Studio" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={{ color: colors.textSecondary }}>Compose instrumental/background music, entirely offline. Atlas synthesizes its own notes and instruments; it does not create vocals or reproduce recordings. The AI option uses your loaded text model, while Create instantly works without one.</Text>
        <TextInput value={prompt} onChangeText={setPrompt} multiline maxLength={500}
          placeholder="Describe an original instrumental mood" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.text }]}>Style</Text>
        {STYLE_GROUPS.map((group) => (
          <View key={group.title}>
            <Text style={[styles.small, { color: colors.textSecondary }]}>{group.title}</Text>
            {chips(group.items, mood, (id: MusicMood) => { setMood(id); if (id in STYLES) setSound(STYLES[id as StyleMood].sound); })}
          </View>
        ))}
        <Text style={[styles.label, { color: colors.text }]}>Instrument sound</Text>
        {chips(SOUND, sound, setSound)}
        <Text style={[styles.label, { color: colors.text }]}>Track duration</Text>
        {chips(DURATIONS.map((n) => ({ id: n, label: `${n} seconds` })), duration, setDuration)}
        <View style={styles.options}>
          <TouchableOpacity onPress={quick} disabled={busy} testID="music-quick" style={[styles.action, { borderColor: colors.primary }]}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Create instantly</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={composeWithAI} disabled={busy} testID="music-compose" style={[styles.action, { borderColor: colors.primary }]}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Compose with local AI</Text>}
          </TouchableOpacity>
        </View>
        {!!playback.error && <Text style={{ color: colors.error }} testID="music-playback-error">{playback.error}</Text>}
        <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="music-persistent-player">
          <Text style={[styles.title, { color: colors.text }]}>Now playing</Text>
          <Text style={{ color: colors.textSecondary }}>{playback.current?.title || 'Choose or create an instrumental'}</Text>
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
        {!!score && <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{score.title}</Text>
          <Text style={{ color: colors.textSecondary }}>{score.bpm} BPM · {score.notes.length} note events · {duration}s</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>Original WAV and editable score saved locally.</Text>
          <Text selectable style={[styles.tiny, { color: colors.textMuted }]}>{file}</Text>
        </View>}
        <Text style={[styles.title, { color: colors.text }]}>My instrumentals ({tracks.length})</Text>
        {!tracks.length && <Text style={{ color: colors.textSecondary }}>Create a track to build your offline playlist.</Text>}
        {tracks.map((track) => (
          <View key={track.id} style={[styles.result, { backgroundColor: colors.surface, borderColor: activeTrack?.id === track.id ? colors.primary : colors.border }]}>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setSelected(track.id); play(track); }} testID={`music-track-${track.id}`}>
              <Text style={[styles.label, { color: colors.text }]}>{track.title}</Text>
              <Text style={[styles.small, { color: colors.textSecondary }]}>{track.mood} · {track.sound} · {track.seconds}s {playback.current?.id === track.id && playback.playing ? '· Playing' : ''}</Text>
            </TouchableOpacity>
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
  action: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginVertical: 3 },
  label: { fontWeight: '600' },
  small: { fontSize: 12 },
  tiny: { fontSize: 11 },
  centered: { alignSelf: 'center' },
  end: { alignSelf: 'flex-end' },
  result: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 7 },
});
