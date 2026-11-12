import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, NativeModules, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { audioRecorderService } from '../services/audioRecorderService';
import { useAtlasVoiceStore } from './store';
import { useNeuralVoices, selectVoice, importVoiceFile } from './neural';
import { useVoiceProfiles } from './profiles';
import { analyzeCloneReference, improveCloneReference, deleteCloneReference, importCloneReference, useCloneReferences, type VoiceReferenceQuality } from './cloneStore';
import { isPocketVoiceId, voiceReferenceName } from './cloneRouting';
import { speak, stop as stopSpeech } from './tts';

const MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-pocket-tts-int8-2026-01-26.tar.bz2';

/** Voice cloning is strictly local, opt-in, and requires a compatible PocketTTS ONNX model. */
export function VoiceCloneCard() {
  const { colors } = useTheme();
  const installed = useNeuralVoices((s) => s.installed);
  const models = Object.keys(installed).filter(isPocketVoiceId);
  const references = useCloneReferences((s) => s.references);
  const addProfile = useVoiceProfiles((s) => s.addProfile);
  const [consent, setConsent] = useState(false);
  const steps = useAtlasVoiceStore((s) => s.cloneSteps);
  const setSteps = useAtlasVoiceStore((s) => s.setCloneSteps);
  const [name, setName] = useState('My cloned voice');
  const [referenceId, setReferenceId] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [benchmark, setBenchmark] = useState('');
  const [quality, setQuality] = useState<VoiceReferenceQuality | null>(null);
  const recordStarted = useRef(0);
  const ownRecording = useRef(false);
  useEffect(() => () => { if (ownRecording.current && audioRecorderService.isCurrentlyRecording()) audioRecorderService.cancelRecording(); }, []);
  useEffect(() => {
    if (!recording) return;
    setRecordSeconds(0);
    const clock = setInterval(() => setRecordSeconds(Math.floor((Date.now() - recordStarted.current) / 1000)), 500);
    return () => clearInterval(clock);
  }, [recording]);
  const available = Platform.OS === 'android' && !!NativeModules.AtlasTts?.importVoiceReference;
  const model = models[0] ?? '';
  const selectedReference = references.find((r) => r.id === referenceId);
  const currentVoice = useAtlasVoiceStore((s) => s.neuralVoice);
  const currentRef = useAtlasVoiceStore((s) => s.neuralReferenceId);

  const fail = (e: unknown) => Alert.alert('Voice cloning', String((e as any)?.message || e));
  const addRecording = async () => {
    if (!consent) return;
    if (audioRecorderService.isCurrentlyRecording()) { Alert.alert('Recorder busy', 'Finish the current voice note or call first.'); return; }
    try {
      await audioRecorderService.startRecording();
      ownRecording.current = true;
      recordStarted.current = Date.now();
      setRecording(true);
    } catch (e) { fail(e); }
  };
  const stopRecording = async () => {
    ownRecording.current = false;
    setRecording(false);
    setBusy(true);
    let recordingPath = '';
    try {
      const result = await audioRecorderService.stopRecording();
      recordingPath = result.path.replace(/^file:\/\//, '');
      const seconds = result.durationSeconds || (Date.now() - recordStarted.current) / 1000;
      if (seconds < 3 || seconds > 30) throw new Error('Use a 5–15 second clear sample (allowed: 3–30 seconds).');
      const uri = result.path.startsWith('file:') ? result.path : `file://${result.path}`;
      const reference = await importCloneReference(uri, name);
      setReferenceId(reference.id);
    } catch (e) { fail(e); }
    finally {
      // Always erase the temporary Document recording, even if validation/import failed.
      // Only the explicitly imported private no-backup copy is retained.
      if (recordingPath) {
        const RNFS = require('@dr.pogodin/react-native-fs');
        await RNFS.unlink(recordingPath).catch(() => undefined);
      }
      setBusy(false);
    }
  };
  const pickRecording = async () => {
    if (!consent) return;
    setBusy(true);
    try {
      const { pick } = require('@react-native-documents/picker');
      const result = await pick({ mode: 'open', allowMultiSelection: false, type: ['audio/wav', 'audio/x-wav', 'audio/wave'] });
      const file = result?.[0];
      if (file) {
        const reference = await importCloneReference(file.uri, name);
        setReferenceId(reference.id);
      }
    } catch (e: any) {
      if (!/OPERATION_CANCELED/i.test(String(e?.code || ''))) fail(e);
    } finally { setBusy(false); }
  };
  const diagnoseSample = async () => {
    if (!selectedReference || !consent || busy) return;
    setBusy(true); setQuality(null);
    try { setQuality(await analyzeCloneReference(selectedReference.id)); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const improveSample = async () => {
    if (!selectedReference || !consent || busy) return;
    setBusy(true);
    try {
      const copy = await improveCloneReference(selectedReference.id);
      setReferenceId(copy.id);
      setQuality(await analyzeCloneReference(copy.id));
      Alert.alert('Improved sample saved', 'A separate trimmed, normalized copy was saved. Your original and existing agent voices were not changed. Preview both before choosing.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const importModel = async () => {
    setBusy(true);
    try {
      await importVoiceFile(); // Reuses the existing sherpa-onnx archive importer.
    } catch (e: any) { if (!/cancel/i.test(String(e?.message || e?.code))) fail(e); }
    finally { setBusy(false); }
  };
  const changeSteps = async (count: number) => {
    try { await NativeModules.AtlasTts?.setVoiceCloneSteps?.(count); setSteps(count); setBenchmark(''); }
    catch (e) { fail(e); }
  };
  const preview = async () => {
    if (!consent || !model || !selectedReference) return;
    setBusy(true);
    try {
      stopSpeech();
      await selectVoice(model, 0, selectedReference.id);
      speak('Hello. This is a preview of my cloned voice.', 'voice-clone-preview');
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };
  const speedTest = async () => {
    if (!consent || !model || !selectedReference) return;
    stopSpeech(); setBusy(true); setBenchmark('Measuring generation speed on this device…');
    try {
      await selectVoice(model, 0, selectedReference.id);
      const result: { synthesisSeconds: number; audioSeconds: number; realTimeFactor: number } =
        await NativeModules.AtlasTts.benchmarkVoiceClone('Hello. I am testing the generation speed of this voice.');
      setBenchmark(`${result.audioSeconds.toFixed(1)}s of speech generated in ${result.synthesisSeconds.toFixed(1)}s (RTF ${result.realTimeFactor.toFixed(2)}; below 1 is faster than real time).`);
    } catch (e) { setBenchmark(''); fail(e); } finally { setBusy(false); }
  };
  const saveProfile = async () => {
    if (!consent || !model || !selectedReference) return;
    const safeName = voiceReferenceName(name);
    addProfile({ name: safeName, voiceId: model, sid: 0, rate: 1, referenceId: selectedReference.id });
    Alert.alert('Saved', `${safeName} can now be assigned to an agent in Agents → Edit.`);
  };

  return (
    <View testID="voice-clone-card" style={[styles.card, { backgroundColor: colors.surface }] }>
      <Text style={[styles.heading, { color: colors.text }]}>Clone a voice (Pocket TTS)</Text>
      <Text style={[styles.note, { color: colors.textSecondary }] }>
        Use a quiet-room, 5–12 second voice sample. Atlas runs Pocket TTS entirely on the phone after the model is imported; no transcript or upload. Select fast or higher-quality generation, then benchmark on your device.
      </Text>
      <View style={styles.row}>
        <Switch testID="voice-clone-consent" value={consent} onValueChange={setConsent} disabled={recording} />
        <Text style={[styles.note, styles.flex, { color: colors.text }]}>I own this voice or have permission to reproduce it. Samples stay on this device.</Text>
      </View>
      {!available && <Text style={[styles.note, { color: colors.textSecondary }]}>Native Pocket TTS cloning requires an updated Android build.</Text>}
      {available && !model && (
        <View>
          <Text style={[styles.note, { color: colors.textSecondary }]}>Install the Pocket TTS INT8 sherpa-onnx model once. The standard Piper, Kokoro and KittenTTS voices cannot clone a new voice.</Text>
          <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(MODEL_URL).catch(fail)}>
            <Text style={{ color: colors.primary }}>Download the Pocket TTS model archive</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={importModel} disabled={!consent || busy} testID="voice-clone-import-model">
            <Text style={{ color: colors.primary }}>Import downloaded model</Text>
          </TouchableOpacity>
        </View>
      )}
      {available && (
        <>
          <TextInput testID="voice-clone-name" value={name} onChangeText={setName} placeholder="Name this voice" placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
          <View style={styles.row}>
            <TouchableOpacity style={styles.action} testID="voice-clone-record" disabled={!consent || busy}
              onPress={recording ? stopRecording : addRecording}>
              <Text style={{ color: colors.primary }}>{recording ? 'Stop and save recording' : 'Record a sample'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} testID="voice-clone-import-wav" disabled={!consent || busy || recording} onPress={pickRecording}>
              <Text style={{ color: colors.primary }}>Import WAV</Text>
            </TouchableOpacity>
          </View>
          {recording && <Text style={{ color: colors.textSecondary }}>Recording: {recordSeconds}s. Speak clearly for 5–12 seconds; stop before 30 seconds.</Text>}
          {references.map((ref) => (
            <View key={ref.id} style={styles.row}>
              <TouchableOpacity style={styles.flex} onPress={() => { setReferenceId(ref.id); setQuality(null); }} testID={`clone-sample-${ref.id}`}>
                <Text style={{ color: colors.text }}>{referenceId === ref.id ? '◉ ' : '○ '}{ref.name} ({ref.seconds.toFixed(1)}s)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('Delete voice sample?', `${ref.name} — any agent profile using this sample will stop working until a new reference is assigned.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteCloneReference(ref.id).then(() => { if (referenceId === ref.id) setReferenceId(''); }).catch(fail) },
              ])}>
                <Text style={{ color: colors.error }}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ marginTop: 12, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border }} testID="voice-clone-quality-wizard">
            <Text style={[styles.heading, { color: colors.text }]}>Voice sample check</Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>Analyze a recording locally. Atlas checks clipping, silence, loudness and likely background noise. Improve creates an optional new copy; it does not rewrite the original.</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.action} disabled={!consent || !selectedReference || busy || recording} onPress={diagnoseSample} testID="voice-clone-analyze">
                <Text style={{ color: colors.primary }}>Analyze recording</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.action} disabled={!consent || !selectedReference || busy || recording} onPress={improveSample} testID="voice-clone-improve">
                <Text style={{ color: colors.primary }}>Create improved copy</Text>
              </TouchableOpacity>
            </View>
            {quality && <View testID="voice-clone-quality-results">
              <Text style={[styles.note, { color: colors.text, fontWeight: '600' }]}>Rating: {quality.rating.replace('-', ' ')} · {quality.seconds.toFixed(1)}s</Text>
              <Text style={[styles.note, { color: colors.textSecondary }]}>Noise estimate {quality.signalNoiseDb.toFixed(1)} dB · clipping {quality.clippedPercent.toFixed(2)}% · quiet {quality.quietPercent.toFixed(0)}%</Text>
              {quality.advice.map((advice) => <Text key={advice} style={[styles.note, { color: colors.textSecondary }]}>• {advice}</Text>)}
            </View>}
          </View>
          <Text style={[styles.note, { color: colors.textSecondary, marginTop: 12 }]}>Speed / voice quality (steps):</Text>
          <View style={styles.row}>
            {[2, 3, 5, 8].map((n) => (
              <TouchableOpacity key={n} onPress={() => changeSteps(n)} accessibilityRole="radio" accessibilityState={{ selected: steps === n }}
                style={[styles.action, { borderColor: steps === n ? colors.primary : colors.border }]}>
                <Text style={{ color: colors.text }}>{n === 2 ? 'Fast' : n === 3 ? 'Balanced' : n === 5 ? 'Quality' : 'Best quality'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.action} testID="voice-clone-preview" disabled={!consent || !model || !selectedReference || busy || recording} onPress={preview}>
              <Text style={{ color: colors.primary }}>Preview / Use</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} testID="voice-clone-benchmark" disabled={!consent || !model || !selectedReference || busy || recording} onPress={speedTest}>
              <Text style={{ color: colors.primary }}>Speed test</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} testID="voice-clone-save" disabled={!consent || !model || !selectedReference || busy || recording} onPress={saveProfile}>
              <Text style={{ color: colors.primary }}>Save as agent voice</Text>
            </TouchableOpacity>
          </View>
          {!!benchmark && <Text style={[styles.note, { color: colors.textSecondary }]}>{benchmark}</Text>}
          {!!currentRef && !!currentVoice && isPocketVoiceId(currentVoice) && (
            <Text style={[styles.note, { color: colors.textSecondary }]}>Currently using a cloned voice. Change it using Voice profiles or the picker above.</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  note: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  action: { borderWidth: 1, borderColor: '#777777', borderRadius: 8, padding: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 9, marginTop: 12 },
  flex: { flex: 1 },
});
