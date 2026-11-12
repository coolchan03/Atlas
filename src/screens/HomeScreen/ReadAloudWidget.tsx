import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { readAloud, useReadAloud } from '../../atlasVoice/readAloud';
import { useReadAloudSource } from '../../atlasVoice/useReadAloudSource';
import { ReadVoiceChooser } from '../../atlasVoice/ReadVoiceChooser';
import { widgetStyles as w } from './widgetStyles';

/** Paste text or open a document, pick a voice and read it, all without leaving Home. The full screen has more room. */
export function ReadAloudWidget({ openReader }: { openReader: () => void }) {
  const { colors } = useTheme();
  const reader = useReadAloud();
  const source = useReadAloudSource();
  const reading = reader.status === 'reading';
  const paused = reader.status === 'paused';
  let detail = 'Paste text or open a document, choose a voice, and press Read.';
  if (reading || paused) detail = `${reading ? 'Reading' : 'Paused'} · part ${Math.min(reader.index + 1, reader.parts.length)} of ${reader.parts.length}`;
  const canRead = !!source.text.trim();
  return (
    <View testID="home-read-aloud-widget" style={[w.card, { borderColor: colors.border }]}>
      <Text style={[w.title, { color: colors.text }]} numberOfLines={1}>{reader.title || source.document?.title || 'Read aloud'}</Text>
      <Text style={[w.detail, { color: colors.textSecondary }]}>{detail}</Text>
      {!source.document && (
        <TextInput testID="widget-read-text" value={source.typed} onChangeText={source.setTyped} multiline numberOfLines={3} textAlignVertical="top"
          placeholder="Paste text to read" placeholderTextColor={colors.textMuted}
          style={[w.input, { color: colors.text, borderColor: colors.border }]} />
      )}
      <ReadVoiceChooser />
      <View style={w.actions}>
        {reading && (
          <TouchableOpacity testID="widget-read-toggle" onPress={readAloud.pause} accessibilityLabel="Pause reading">
            <Icon name="pause-circle" size={29} color={colors.primary} />
          </TouchableOpacity>
        )}
        {paused && (
          <TouchableOpacity testID="widget-read-toggle" onPress={readAloud.play} accessibilityLabel="Resume reading">
            <Icon name="play-circle" size={29} color={colors.primary} />
          </TouchableOpacity>
        )}
        {!reading && !paused && (
          <TouchableOpacity testID="widget-read-start" onPress={source.play} disabled={!canRead} accessibilityLabel="Read aloud">
            <Text style={{ color: canRead ? colors.primary : colors.textMuted }}>Read</Text>
          </TouchableOpacity>
        )}
        {(reading || paused) && (
          <TouchableOpacity testID="widget-read-stop" onPress={readAloud.stop} accessibilityLabel="Stop reading">
            <Icon name="square" size={23} color={colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity testID="widget-read-document" onPress={source.openDocument} accessibilityLabel="Open a document to read">
          <Text style={{ color: colors.primary }}>Open document</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="widget-read-open" onPress={openReader} accessibilityLabel="Open Read aloud" style={w.pushRight}>
          <Text style={{ color: colors.primary }}>More</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
