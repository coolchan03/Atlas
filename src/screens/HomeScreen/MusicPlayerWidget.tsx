import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { instrumentalPlayer, useMusicPlayback } from '../../music/backgroundPlayer';
import { useMusicLibrary } from '../../music/library';

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
    <View testID="home-music-player-widget" style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 8 }}>
      <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{playback.current?.title || 'Instrumental music'}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{playback.playing ? 'Playing' : playback.paused ? 'Paused' : `${tracks.length} saved track${tracks.length === 1 ? '' : 's'}`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 }}>
        <TouchableOpacity testID="widget-music-toggle" onPress={toggle} accessibilityLabel={playback.playing ? 'Pause music' : 'Play music'}><Icon name={playback.playing ? 'pause-circle' : 'play-circle'} size={29} color={colors.primary}/></TouchableOpacity>
        <TouchableOpacity testID="widget-music-next" onPress={next} disabled={!tracks.length} accessibilityLabel="Next instrumental"><Icon name="skip-forward" size={23} color={tracks.length ? colors.text : colors.textMuted}/></TouchableOpacity>
        <TouchableOpacity testID="widget-music-open" onPress={openStudio} accessibilityLabel="Open Music Studio" style={{ marginLeft: 'auto' }}><Text style={{ color: colors.primary }}>Music Studio</Text></TouchableOpacity>
      </View>
    </View>
  );
}
