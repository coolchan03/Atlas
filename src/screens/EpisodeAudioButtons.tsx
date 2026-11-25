import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { exportEpisodeAudio, type EpisodeAudio, type EpisodeAudioOpts } from '../atlasVoice/briefingAudio';
import type { CastLine } from '../atlasVoice/podcastAudio';
import { saveExistingFile } from '../study/exportFiles';
import { shareItem } from '../utils/shareItem';

const minutesText = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
const fileName = (title: string) => `${title.replace(/[^A-Za-z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Atlas briefing'}.wav`;

/** Turns the whole show into one audio file, then offers to share it or save it where the person chooses. */
export const EpisodeAudioButtons: React.FC<{ audioKey: string; items: CastLine[]; title: string; tunes?: EpisodeAudioOpts['tunes']; jingleVolume?: EpisodeAudioOpts['jingleVolume'] }> = ({ audioKey, items, title, tunes, jingleVolume }) => {
  const { colors } = useTheme();
  const [progress, setProgress] = useState('');
  const [made, setMade] = useState<EpisodeAudio | null>(null);
  const [error, setError] = useState('');
  const working = !!progress;

  const make = async () => {
    setError(''); setMade(null); setProgress('Starting');
    try {
      const audio = await exportEpisodeAudio(audioKey, items, {
        title, tunes, jingleVolume,
        onProgress: (stage, done, total) => setProgress(stage === 'voice' ? `Making the voices: ${done} of ${total} lines` : `Joining the audio: ${Math.round((done / total) * 100)}%`),
      });
      setMade(audio);
    } catch (e) { setError((e as Error)?.message || 'Could not make the audio file'); }
    finally { setProgress(''); }
  };
  const save = async () => {
    if (!made) return;
    try {
      const name = await saveExistingFile(made.path, fileName(title), 'audio/wav');
      if (name) Alert.alert('Saved', name);
    } catch (e) { Alert.alert('Could not save the file', String((e as Error)?.message || e)); }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" testID="export-briefing-audio" disabled={working} onPress={() => { void make(); }} style={[styles.action, working && styles.dim]}>
          {working ? <ActivityIndicator color={colors.primary} /> : <Icon name="headphones" size={18} color={colors.primary} />}
          <Text style={[styles.label, { color: colors.primary }]}>{made ? 'Make the audio again' : 'Save as audio file'}</Text>
        </TouchableOpacity>
        {!!made && (
          <>
            <TouchableOpacity accessibilityRole="button" testID="share-briefing-audio" onPress={() => { void shareItem({ title, file: made.path }); }} style={styles.action}>
              <Icon name="share-2" size={18} color={colors.primary} />
              <Text style={[styles.label, { color: colors.primary }]}>Share audio</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" testID="keep-briefing-audio" onPress={() => { void save(); }} style={styles.action}>
              <Icon name="download" size={18} color={colors.primary} />
              <Text style={[styles.label, { color: colors.primary }]}>Save to phone</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      {!!progress && <Text testID="briefing-audio-progress" style={[styles.meta, { color: colors.textSecondary }]}>{progress}</Text>}
      {!!made && <Text testID="briefing-audio-ready" style={[styles.meta, { color: colors.textSecondary }]}>Ready: one audio file, about {minutesText(made.seconds)}, with the opening and closing tunes. Share it to a podcast app, messages or files, or save it to Downloads.</Text>}
      {!!error && <Text testID="briefing-audio-error" style={[styles.meta, { color: colors.error }]}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', marginRight: SPACING.lg, paddingVertical: SPACING.sm },
  dim: { opacity: 0.6 },
  label: { ...TYPOGRAPHY.body, marginLeft: SPACING.sm },
  meta: { ...TYPOGRAPHY.bodySmall },
});
