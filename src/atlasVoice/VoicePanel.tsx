import React from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useAtlasVoiceStore } from './store';
import { speak } from './tts';

const RATES = [0.75, 1, 1.25, 1.5];

/** Models -> Voice: settings for the phone's built-in voice (replaces the paid voice-models tab). */
export function AtlasVoicePanel() {
  const { colors } = useTheme();
  const rate = useAtlasVoiceStore((s) => s.rate);
  const setRate = useAtlasVoiceStore((s) => s.setRate);
  const autoSpeak = useAtlasVoiceStore((s) => s.autoSpeakInChat);
  const setAutoSpeak = useAtlasVoiceStore((s) => s.setAutoSpeakInChat);
  const openTtsSettings = () => {
    Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() => Linking.openSettings());
  };
  const card = [styles.card, { backgroundColor: colors.surface }];
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={card}>
        <Text style={[styles.h, { color: colors.text }]}>Voice</Text>
        <Text style={[styles.p, { color: colors.textSecondary }]}>
          Answers are read with your phone's built-in voice. Nothing to download here. For offline use, open the
          phone's text-to-speech settings, pick an engine (Google or Samsung), and install the voice data for your language.
        </Text>
        <TouchableOpacity style={[styles.btn, { borderColor: colors.primary }]} onPress={openTtsSettings}>
          <Text style={{ color: colors.primary }}>Open phone voice settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { borderColor: colors.primary }]}
          onPress={() => speak('This is how answers will sound. If you can hear this, voice is working.', 'voice-test')}
        >
          <Text style={{ color: colors.primary }}>Test voice</Text>
        </TouchableOpacity>
      </View>
      <View style={card}>
        <Text style={[styles.h, { color: colors.text }]}>Speed</Text>
        <View style={styles.row}>
          {RATES.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRate(r)}
              style={[styles.pill, { backgroundColor: r === rate ? colors.primary : colors.background }]}
            >
              <Text style={{ color: r === rate ? '#fff' : colors.text }}>{r}x</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[card, styles.rowBetween]}>
        <View style={styles.flex}>
          <Text style={[styles.h, { color: colors.text }]}>Read answers aloud in text chats</Text>
          <Text style={[styles.p, { color: colors.textSecondary }]}>Voice mode always reads answers aloud.</Text>
        </View>
        <Switch value={autoSpeak} onValueChange={setAutoSpeak} />
      </View>
      <View style={card}>
        <Text style={[styles.h, { color: colors.text }]}>Talking to the app</Text>
        <Text style={[styles.p, { color: colors.textSecondary }]}>
          To talk instead of type, download a speech-to-text (Whisper) model in the Transcription tab. Then tap the
          phone icon at the top of a chat. Turn on Hands-free for a back-and-forth conversation like a phone call.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 120 },
  card: { borderRadius: 10, padding: 14, marginBottom: 12 },
  h: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  p: { fontSize: 13, lineHeight: 18 },
  btn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  row: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, paddingRight: 10 },
});
