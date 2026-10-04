import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useAtlasVoiceStore } from './store';
import { speak } from './tts';
import { NEURAL_VOICES, useNeuralVoices, refreshInstalled, downloadVoice, cancelVoiceDownload, deleteVoice, selectVoice, neuralAvailable } from './neural';

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
  const current = useAtlasVoiceStore((s) => s.neuralVoice);
  const sid = useAtlasVoiceStore((s) => s.neuralSid);
  const progress = useNeuralVoices((s) => s.progress);
  const installed = useNeuralVoices((s) => s.installed);
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => { refreshInstalled().catch(() => undefined); }, []);
  const choose = async (id: string, speaker?: number) => {
    setLoading(id || 'phone');
    try {
      await selectVoice(id, speaker);
      speak(id ? 'Hi. This is how I will sound from now on.' : 'This is the phone voice.', 'voice-test');
    } catch (e: any) { Alert.alert('Could not use this voice', String(e?.message || e)); } finally { setLoading(null); }
  };
  const get = async (id: string) => {
    try { await downloadVoice(id); await choose(id, 0); }
    catch (e: any) { if (!/cancel/i.test(String(e?.message))) Alert.alert('Download failed', `${String(e?.message || e)}\n\nYou need internet for the download. After that the voice works offline.`); }
  };
  const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {neuralAvailable() && (
        <View style={card}>
          <Text style={[styles.h, { color: colors.text }]}>Natural voices (recommended)</Text>
          <Text style={[styles.p, { color: colors.textSecondary }]}>
            Human-sounding voices that run on this device with no internet. Download once (Wi-Fi recommended), then tap to use.
            Other languages (phrase cards) still use the phone voice.
          </Text>
          <TouchableOpacity onPress={() => choose('')} style={[styles.voiceRow, { borderColor: !current ? colors.primary : colors.border }]}>
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Phone voice</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Built in, uses least battery</Text>
            </View>
            {loading === 'phone' ? <ActivityIndicator color={colors.primary} /> : !current ? <Text style={{ color: colors.primary }}>In use</Text> : null}
          </TouchableOpacity>
          {NEURAL_VOICES.map((v) => {
            const have = installed[v.id] !== undefined;
            const p = progress[v.id];
            const inUse = current === v.id;
            return (
              <View key={v.id} style={[styles.voiceRow, { borderColor: inUse ? colors.primary : colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={styles.rowBetween}>
                  <TouchableOpacity style={styles.flex} disabled={!have} onPress={() => choose(v.id, inUse ? sid : 0)}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{v.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{v.desc} {have ? `(${mb(installed[v.id])} on phone)` : v.size}</Text>
                  </TouchableOpacity>
                  {loading === v.id ? <ActivityIndicator color={colors.primary} />
                    : p !== undefined ? (
                      <TouchableOpacity onPress={() => cancelVoiceDownload(v.id)}><Text style={{ color: colors.primary }}>{p >= 0 ? `${Math.round(p * 100)}%` : '...'} ✕</Text></TouchableOpacity>
                    ) : have ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        {inUse ? <Text style={{ color: colors.primary }}>In use</Text> : <TouchableOpacity onPress={() => choose(v.id, 0)}><Text style={{ color: colors.primary }}>Use</Text></TouchableOpacity>}
                        <TouchableOpacity onPress={() => Alert.alert('Delete voice?', v.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteVoice(v.id).catch((e) => Alert.alert('Could not delete', String(e?.message || e))); } }])}>
                          <Text style={{ color: colors.textMuted }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => get(v.id)}><Text style={{ color: colors.primary, fontWeight: '600' }}>Download</Text></TouchableOpacity>
                    )}
                </View>
                {inUse && v.speakers && (
                  <View style={[styles.row, { flexWrap: 'wrap', marginTop: 10 }]}>
                    {v.speakers.map((k) => (
                      <TouchableOpacity key={k.sid} onPress={() => choose(v.id, k.sid)} style={[styles.pill, { backgroundColor: sid === k.sid ? colors.primary : colors.background }]}>
                        <Text style={{ color: sid === k.sid ? colors.background : colors.text, fontSize: 13 }}>{k.name} · {k.accent}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      <View style={card}>
        <Text style={[styles.h, { color: colors.text }]}>Phone voice settings</Text>
        <Text style={[styles.p, { color: colors.textSecondary }]}>
          The phone voice is used when no natural voice is chosen, and for other languages. For offline use, open the
          phone's text-to-speech settings and install the voice data for your languages.
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
              <Text style={{ color: r === rate ? colors.background : colors.text }}>{r}x</Text>
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
  voiceRow: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center' },
});
