import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { readAloud, useReadAloud } from '../../atlasVoice/readAloud';
import { widgetStyles as w } from './widgetStyles';

/** Shows what is being read aloud, with play, pause and stop; the full screen opens to paste text or pick a document. */
export function ReadAloudWidget({ openReader }: { openReader: () => void }) {
  const { colors } = useTheme();
  const reader = useReadAloud();
  const reading = reader.status === 'reading';
  const loaded = reader.parts.length > 0;
  let detail = 'Paste text or open a document to have it read to you.';
  if (loaded) detail = `${reading ? 'Reading' : 'Paused'} · part ${Math.min(reader.index + 1, reader.parts.length)} of ${reader.parts.length}`;
  return (
    <View testID="home-read-aloud-widget" style={[w.card, { borderColor: colors.border }]}>
      <Text style={[w.title, { color: colors.text }]} numberOfLines={1}>{reader.title || 'Read aloud'}</Text>
      <Text style={[w.detail, { color: colors.textSecondary }]}>{detail}</Text>
      <View style={w.actions}>
        {loaded && (
          <TouchableOpacity testID="widget-read-toggle" onPress={reading ? readAloud.pause : readAloud.play} accessibilityLabel={reading ? 'Pause reading' : 'Resume reading'}>
            <Icon name={reading ? 'pause-circle' : 'play-circle'} size={29} color={colors.primary} />
          </TouchableOpacity>
        )}
        {loaded && (
          <TouchableOpacity testID="widget-read-stop" onPress={readAloud.stop} accessibilityLabel="Stop reading">
            <Icon name="square" size={23} color={colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity testID="widget-read-open" onPress={openReader} accessibilityLabel="Open Read aloud" style={w.pushRight}>
          <Text style={{ color: colors.primary }}>{loaded ? 'Open' : 'Read something'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
