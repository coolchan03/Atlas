import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useMusicLibrary } from './library';
import { FREE_SOUNDFONT, downloadFreeSoundfont, pickAndInstallSoundfont, removeSoundfont, setRealInstruments } from './soundfontFiles';

const megabytes = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;

/** Real instruments: the recordings (a SoundFont) the tunes are played on, instead of the built-in synthesiser. */
export function SoundfontCard() {
  const { colors } = useTheme();
  const sf = useMusicLibrary((s) => s.soundfont);
  const on = useMusicLibrary((s) => s.useSoundfont);
  const [busy, setBusy] = useState('');
  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what);
    try { await job(); } catch (e) { Alert.alert('Could not add the instruments', String((e as Error)?.message || e)); } finally { setBusy(''); }
  };
  const download = () => run('Downloading...', () => downloadFreeSoundfont((share) => setBusy(`Downloading ${Math.round(share * 100)}%...`)));
  const pick = () => run('Reading the file...', pickAndInstallSoundfont);
  const button = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity onPress={onPress} disabled={!!busy} accessibilityRole="button" testID={testID} style={[styles.btn, { borderColor: colors.border }]}>
      <Text style={{ color: busy ? colors.textMuted : colors.primary }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="music-instruments">
      <Text style={[styles.title, { color: colors.text }]}>Instruments</Text>
      <Text style={{ color: colors.textSecondary }} testID="music-instruments-state">
        {sf && on ? `Real instruments: ${sf.name} (${megabytes(sf.bytes)}). Pianos, guitars, strings, horns and drums are recordings of the real thing.` : sf ? `Built-in synthesiser. Real instruments (${sf.name}) are installed but switched off.` : 'Built-in synthesiser: every sound is made by the phone from scratch, so it sounds synthetic. Add real instrument recordings for a far more natural sound.'}
      </Text>
      {!!busy && <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary }}>{busy}</Text></View>}
      <View style={styles.row}>
        {!sf && button(`Download free instruments (${FREE_SOUNDFONT.approxMB} MB)`, download, 'music-sf-download')}
        {button('Choose a SoundFont file (.sf2)', pick, 'music-sf-pick')}
        {!!sf && button(on ? 'Use the built-in synthesiser' : 'Use the real instruments', () => setRealInstruments(!on), 'music-sf-toggle')}
        {!!sf && button('Remove', removeSoundfont, 'music-sf-remove')}
      </View>
      {!sf && <Text style={[styles.small, { color: colors.textMuted }]}>The free set is TimGM6mb (GPL licence), a small General MIDI collection. Any .sf2 SoundFont works, and a bigger one sounds better. Tunes already made keep the sound they were made with.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: SPACING.md, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  small: { ...TYPOGRAPHY.bodySmall },
});
