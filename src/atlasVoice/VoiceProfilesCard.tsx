import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useAtlasVoiceStore } from './store';
import { missingPresets, useVoiceProfiles, type VoiceProfile } from './profiles';
import { KOKORO_V1_PRESETS, findNeuralVoice, loadVoiceForSpeech, restoreSavedVoice, useNeuralVoices } from './neural';
import { speak } from './tts';
import { isPocketVoiceId } from './cloneRouting';
import { useCloneReferences } from './cloneStore';

/** Human label for a profile's voice, e.g. "KittenTTS Nano · Kitten 3 · 1.25x". */
export function describeProfile(p: Pick<VoiceProfile, 'voiceId' | 'sid' | 'rate' | 'referenceId'>): string {
  const voice = findNeuralVoice(p.voiceId);
  const clone = p.referenceId ? `Cloned voice` : undefined;
  const speaker = voice?.speakers?.find((k) => k.sid === p.sid)?.name ?? (voice?.imported && p.sid > 0 ? `Speaker ${p.sid + 1}` : undefined);
  return [voice?.name ?? 'Phone voice', clone, speaker, `${p.rate}x`].filter(Boolean).join(' · ');
}

/** Plays a short sample in a profile's voice, then returns to the saved voice. */
export async function previewProfile(p: Pick<VoiceProfile, 'name' | 'voiceId' | 'sid' | 'rate' | 'referenceId'>): Promise<void> {
  await loadVoiceForSpeech(p.voiceId, p.sid, p.referenceId);
  speak(`Hi, I'm ${p.name}. This is how I sound.`, 'voice-test', p.rate);
  const unsub = useAtlasVoiceStore.subscribe((s) => {
    if (s.speakingKey) return;
    unsub();
    restoreSavedVoice().catch(() => undefined);
  });
}

export const SPEEDS = [0.8, 1, 1.2, 1.5] as const;

/** Models -> Voice: save the current voice as a named profile and manage saved profiles. */
export function VoiceProfilesCard() {
  const { colors } = useTheme();
  const profiles = useVoiceProfiles((s) => s.profiles);
  const { addProfile, removeProfile, addPresets, setRate } = useVoiceProfiles.getState();
  const hasKokoroV1 = useNeuralVoices((s) => s.installed['kokoro-v1-en'] !== undefined);
  const presets = hasKokoroV1 ? missingPresets(profiles, KOKORO_V1_PRESETS) : [];
  const voiceId = useAtlasVoiceStore((s) => s.neuralVoice);
  const sid = useAtlasVoiceStore((s) => s.neuralSid);
  const rate = useAtlasVoiceStore((s) => s.rate);
  const referenceId = useAtlasVoiceStore((s) => s.neuralReferenceId);
  const references = useCloneReferences((s) => s.references);
  const [name, setName] = useState('');
  const save = () => {
    if (!name.trim()) return;
    addProfile({ name, voiceId, sid, rate, ...(isPocketVoiceId(voiceId) ? { referenceId } : {}) });
    setName('');
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="voice-profiles-card">
      <Text style={[styles.h, { color: colors.text }]}>Voice profiles</Text>
      <Text style={[styles.p, { color: colors.textSecondary }]}>
        Save the voice, speaker and speed chosen above under a name, then give it to an agent (Agents → edit) so
        that agent's answers are read in its own voice. Profiles stay on this device.
      </Text>
      <Text style={[styles.p, styles.current, { color: colors.textMuted }]}>Current: {describeProfile({ voiceId, sid, rate })}</Text>
      {isPocketVoiceId(voiceId) ? (
        <Text style={[styles.p, styles.current, { color: colors.textSecondary }]}>Cloned voices are named and created in the Clone a voice card above.</Text>
      ) : <View style={styles.row}>
        <TextInput
          testID="voice-profile-name"
          value={name}
          onChangeText={setName}
          placeholder="Name for the voice chosen above"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <TouchableOpacity testID="voice-profile-save" onPress={save} disabled={!name.trim()} style={[styles.btn, !name.trim() && styles.disabled, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary }}>Save</Text>
        </TouchableOpacity>
      </View>}
      {presets.length > 0 && (
        <TouchableOpacity testID="voice-profile-presets" onPress={() => addPresets(presets)} style={[styles.btn, styles.presets, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary }}>Add ready-made: {presets.map((p) => p.name).join(', ')}</Text>
        </TouchableOpacity>
      )}
      {profiles.map((p) => (
        <View key={p.id} style={[styles.profile, { borderColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: colors.text }]}>{p.name}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{describeProfile(p)}{p.referenceId ? ` · ${references.find((r) => r.id === p.referenceId)?.name ?? 'Missing reference recording'}` : ''}</Text>
          </View>
          {p.referenceId && (
            <View style={styles.speeds}>
              {SPEEDS.map((n) => (
                <TouchableOpacity key={n} onPress={() => setRate(p.id, n)} accessibilityRole="radio" accessibilityState={{ selected: p.rate === n }} testID={`profile-speed-${p.id}-${n}`}>
                  <Text style={{ color: p.rate === n ? colors.primary : colors.textMuted }}>{n}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={() => { previewProfile(p).catch(() => undefined); }} style={styles.action}>
            <Text style={{ color: colors.primary }}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Delete profile?', p.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => removeProfile(p.id) },
            ])}
            style={styles.action}
          >
            <Text style={{ color: colors.textMuted }}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 12 },
  h: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  p: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  presets: { marginTop: 10 },
  current: { marginTop: 6 },
  disabled: { opacity: 0.5 },
  name: { fontWeight: '600' },
  meta: { fontSize: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  flex: { flex: 1, paddingRight: 8 },
  action: { paddingHorizontal: 8, paddingVertical: 6 },
  speeds: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
});
