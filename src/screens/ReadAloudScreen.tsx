import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAtlasVoiceStore } from '../atlasVoice/store';
import { ReadVoiceChooser } from '../atlasVoice/ReadVoiceChooser';
import { useReadAloudSource } from '../atlasVoice/useReadAloudSource';
import { ttsAvailable } from '../atlasVoice/tts';
import { readAloud, readingMinutes, useReadAloud } from '../atlasVoice/readAloud';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/** Progress, the piece being read, and the play, pause, stop and skip buttons. */
const Player: React.FC<{ canPlay: boolean; onPlay: () => void }> = ({ canPlay, onPlay }) => {
  const { colors } = useTheme();
  const reader = useReadAloud();
  const reading = reader.status === 'reading';
  const hasParts = reader.parts.length > 0;
  const progress = hasParts ? Math.min(1, reader.index / reader.parts.length) : 0;
  const current = hasParts && reader.status !== 'idle' ? reader.parts[Math.min(reader.index, reader.parts.length - 1)] : '';
  return (
    <View style={[styles.player, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="read-aloud-player">
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
      </View>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {hasParts ? `Part ${Math.min(reader.index + 1, reader.parts.length)} of ${reader.parts.length}` : 'Ready when you are'}
      </Text>
      {reading && reader.preparing && (
        <View style={styles.preparing} testID="read-aloud-preparing">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.meta, { color: colors.textSecondary }]}>Getting the voice ready. A cloned voice can take several seconds the first time.</Text>
        </View>
      )}
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => readAloud.jump(-1)} disabled={!hasParts} accessibilityLabel="Previous part" testID="read-aloud-prev">
          <Icon name="skip-back" size={22} color={hasParts ? colors.text : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={reading ? readAloud.pause : onPlay} disabled={!reading && !canPlay} testID={reading ? 'read-aloud-pause' : 'read-aloud-play'}
          accessibilityLabel={reading ? 'Pause reading' : 'Start reading'}>
          <Icon name={reading ? 'pause-circle' : 'play-circle'} size={44} color={reading || canPlay ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={readAloud.stop} disabled={reader.status === 'idle'} accessibilityLabel="Stop reading" testID="read-aloud-stop">
          <Icon name="square" size={22} color={reader.status === 'idle' ? colors.textMuted : colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => readAloud.jump(1)} disabled={!hasParts} accessibilityLabel="Next part" testID="read-aloud-next">
          <Icon name="skip-forward" size={22} color={hasParts ? colors.text : colors.textMuted} />
        </TouchableOpacity>
      </View>
      {!!current && <Text style={[styles.current, { color: colors.textSecondary }]} numberOfLines={4}>{current}</Text>}
    </View>
  );
};

/** Paste text or open a document, and Atlas reads it aloud in the chosen voice. */
export const ReadAloudScreen: React.FC = () => {
  const { colors } = useTheme();
  const rate = useAtlasVoiceStore((s) => s.rate);
  const setRate = useAtlasVoiceStore((s) => s.setRate);
  const source = useReadAloudSource();
  const available = ttsAvailable();
  const { document, words, text } = source;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Read aloud" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Paste text or open a document and Atlas reads it to you. The voice runs on this phone; nothing is sent anywhere.
        </Text>
        {!available && <Text style={[styles.note, { color: colors.error }]}>Reading aloud needs the Android voice engine, which is not available in this build.</Text>}

        {document ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="read-aloud-document">
            <Icon name="file-text" size={20} color={colors.primary} />
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{document.title}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{words.toLocaleString()} words</Text>
            </View>
          </View>
        ) : (
          <TextInput testID="read-aloud-text" value={source.typed} onChangeText={source.setTyped} multiline textAlignVertical="top"
            placeholder="Paste or type text to read aloud" placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        )}

        <View style={styles.row}>
          <TouchableOpacity style={[styles.action, { borderColor: colors.primary }]} onPress={source.openDocument} disabled={source.opening} testID="read-aloud-open" accessibilityRole="button">
            {source.opening ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Open a document</Text>}
          </TouchableOpacity>
          {(!!document || !!source.typed) && (
            <TouchableOpacity style={[styles.action, { borderColor: colors.border }]} onPress={source.clear} testID="read-aloud-clear" accessibilityRole="button">
              <Text style={{ color: colors.text }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {words > 0 && <Text style={[styles.meta, { color: colors.textSecondary }]}>{words.toLocaleString()} words, about {readingMinutes(words, rate)} min at {rate}x</Text>}

        <Text style={[styles.label, { color: colors.text }]}>Voice</Text>
        <ReadVoiceChooser />
        
        <Text style={[styles.label, { color: colors.text }]}>Speed</Text>
        <View style={styles.row}>
          {SPEEDS.map((s) => (
            <TouchableOpacity key={s} onPress={() => setRate(s)} accessibilityRole="radio" accessibilityState={{ selected: rate === s }}
              style={[styles.chip, { borderColor: rate === s ? colors.primary : colors.border, backgroundColor: rate === s ? colors.primary : colors.surface }]}>
              <Text style={{ color: rate === s ? colors.background : colors.text }}>{s}x</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Player canPlay={available && !!text.trim()} onPlay={source.play} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },
  note: { ...TYPOGRAPHY.bodySmall },
  label: { ...TYPOGRAPHY.h3 },
  meta: { ...TYPOGRAPHY.bodySmall, fontSize: 12 },
  preparing: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  input: { ...TYPOGRAPHY.body, minHeight: 160, borderWidth: 1, borderRadius: 10, padding: SPACING.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderRadius: 10, padding: SPACING.md },
  cardText: { flex: 1 },
  cardTitle: { ...TYPOGRAPHY.body },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  action: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  player: { borderWidth: 1, borderRadius: 12, padding: SPACING.lg, gap: SPACING.md },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  current: { ...TYPOGRAPHY.bodySmall },
});
