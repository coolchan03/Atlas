import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { instrumentalPlayer, useMusicPlayback } from '../../music/backgroundPlayer';
import { useMusicLibrary } from '../../music/library';
import { widgetStyles as w } from './widgetStyles';

/** Functional in-app widget; audio graph survives Home -> Chat -> Studio navigation. */
export function MusicPlayerWidget({ openStudio }: { openStudio: () => void }) {
  const { colors } = useTheme();
  const playback = useMusicPlayback();
  const tracks = useMusicLibrary((s) => s.tracks);
  const toggle = async () => {
    try {
      if (playback.playing) instrumentalPlayer.pause();
      else if (playback.paused) await instrumentalPlayer.resume();
      else if (playback.current) await instrumentalPlayer.play(playback.current);
      else if (tracks.length) await instrumentalPlayer.play(tracks[0]);
      else openStudio();
    } catch (e: any) { Alert.alert('Music playback', String(e?.message || e)); }
  };
  const next = () => instrumentalPlayer.next().catch((e: any) => Alert.alert('Music playback', String(e?.message || e)));
  return (
    <View testID="home-music-player-widget" style={[w.card, { borderColor: colors.border }]}>
      <Text style={[w.title, { color: colors.text }]} numberOfLines={1}>{playback.current?.title || 'Instrumental music'}</Text>
      <Text style={[w.detail, { color: colors.textSecondary }]}>{playback.playing ? 'Playing' : playback.paused ? 'Paused' : `${tracks.length} saved track${tracks.length === 1 ? '' : 's'}`}</Text>
      <View style={w.actions}>
        <TouchableOpacity testID="widget-music-toggle" onPress={toggle} accessibilityLabel={playback.playing ? 'Pause music' : 'Play music'}><Icon name={playback.playing ? 'pause-circle' : 'play-circle'} size={29} color={colors.primary}/></TouchableOpacity>
        <TouchableOpacity testID="widget-music-next" onPress={next} disabled={!tracks.length} accessibilityLabel="Next instrumental"><Icon name="skip-forward" size={23} color={tracks.length ? colors.text : colors.textMuted}/></TouchableOpacity>
        <TouchableOpacity testID="widget-music-open" onPress={openStudio} accessibilityLabel="Open Music Studio" style={w.pushRight}><Text style={{ color: colors.primary }}>Music Studio</Text></TouchableOpacity>
      </View>
    </View>
  );
}
