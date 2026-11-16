import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useMusicLibrary } from './library';
import { SOUNDFONT_CHOICES, downloadSoundfont, pickAndInstallSoundfont, removeSoundfont, setRealInstruments } from './soundfontFiles';

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
  const download = (choice: (typeof SOUNDFONT_CHOICES)[number]) => run('Downloading...', () => downloadSoundfont(choice, (share) => setBusy(`Downloading ${choice.name} ${Math.round(share * 100)}%...`)));
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
        {button('Choose a SoundFont file (.sf2)', pick, 'music-sf-pick')}
        {!!sf && button(on ? 'Use the built-in synthesiser' : 'Use the real instruments', () => setRealInstruments(!on), 'music-sf-toggle')}
        {!!sf && button('Remove', removeSoundfont, 'music-sf-remove')}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{sf ? 'Switch to another set' : 'Download free instruments'}</Text>
      {SOUNDFONT_CHOICES.map((c) => (
        <View key={c.id} style={styles.choice}>
          <View style={styles.grow}>
            <Text style={{ color: colors.text }}>{c.name} ({c.approxMB} MB){sf?.name === c.name ? ' · in use' : ''}</Text>
            <Text style={[styles.small, { color: colors.textMuted }]}>{c.note}</Text>
          </View>
          {button(sf?.name === c.name ? 'Installed' : 'Download', () => download(c), c.id === 'timgm6mb' ? 'music-sf-download' : `music-sf-download-${c.id}`)}
        </View>
      ))}
      <Text style={[styles.small, { color: colors.textMuted }]}>Any .sf2 SoundFont works too, and a bigger one sounds better. Tunes already made keep the sound they were made with. The AI composer plays on these instruments as well.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: SPACING.md, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  small: { ...TYPOGRAPHY.bodySmall },
  label: { fontWeight: '600' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  grow: { flex: 1 },
});
