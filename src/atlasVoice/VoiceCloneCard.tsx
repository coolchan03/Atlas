import React, { useState } from 'react';
import { ActivityIndicator, Alert, NativeModules, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useAtlasVoiceStore } from './store';
import { useNeuralVoices, importVoiceFile, downloadVoicePackage, cancelVoiceDownload, voiceIdForName } from './neural';
import { deleteCloneReference, useCloneReferences, type VoiceReferenceQuality } from './cloneStore';
import { isPocketVoiceId } from './cloneRouting';
import { useVoiceSample } from './useVoiceSample';
import { useVoiceCreation } from './useVoiceCreation';
import { SPEEDS } from './VoiceProfilesCard';

const STEPS = [2, 3, 5, 8];
const STEP_LABELS: Record<number, string> = { 2: 'Fast', 3: 'Balanced', 5: 'Quality', 8: 'Best quality' };
const MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-pocket-tts-int8-2026-01-26.tar.bz2';

type Reference = ReturnType<typeof useCloneReferences.getState>['references'][number];

/** The saved voice samples, one tappable row each, with delete. */
function SampleList({ references, selectedId, onSelect, onError }: {
  references: Reference[]; selectedId: string; onSelect: (id: string) => void; onError: (e: unknown) => void;
}) {
  const { colors } = useTheme();
  const confirmDelete = (ref: Reference) => Alert.alert('Delete voice sample?', `This removes the sample for "${ref.name}", and that voice stops working. Your other cloned voices are not affected. You do not need to delete a voice to make another one.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteCloneReference(ref.id).catch(onError) },
  ]);
  return (
    <>
      {references.map((ref) => (
        <View key={ref.id} style={styles.row}>
          <TouchableOpacity style={styles.flex} onPress={() => onSelect(ref.id)} testID={`clone-sample-${ref.id}`}>
            <Text style={{ color: colors.text }}>{selectedId === ref.id ? '◉ ' : '○ '}{ref.name} ({ref.seconds.toFixed(1)}s)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete(ref)}>
            <Text style={{ color: colors.error }}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </>
  );
}

/** Analyze the chosen sample locally and optionally save an improved copy. */
function SampleCheck({ canRun, quality, onAnalyze, onImprove }: {
  canRun: boolean; quality: VoiceReferenceQuality | null; onAnalyze: () => void; onImprove: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wizard, { borderColor: colors.border }]} testID="voice-clone-quality-wizard">
      <Text style={[styles.heading, { color: colors.text }]}>Voice sample check</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Analyze a recording locally. Atlas checks clipping, silence, loudness and likely background noise. Improve creates an optional new copy; it does not rewrite the original.</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.action} disabled={!canRun} onPress={onAnalyze} testID="voice-clone-analyze">
          <Text style={{ color: colors.primary }}>Analyze recording</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} disabled={!canRun} onPress={onImprove} testID="voice-clone-improve">
          <Text style={{ color: colors.primary }}>Create improved copy</Text>
        </TouchableOpacity>
      </View>
      {quality && <View testID="voice-clone-quality-results">
        <Text style={[styles.note, styles.strong, { color: colors.text }]}>Rating: {quality.rating.replace('-', ' ')} · {quality.seconds.toFixed(1)}s</Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Noise estimate {quality.signalNoiseDb.toFixed(1)} dB · clipping {quality.clippedPercent.toFixed(2)}% · quiet {quality.quietPercent.toFixed(0)}%</Text>
        {quality.advice.map((advice) => <Text key={advice} style={[styles.note, { color: colors.textSecondary }]}>• {advice}</Text>)}
      </View>}
    </View>
  );
}

/** One-time setup: download the voice engine here, or import a file that is already on the phone. */
function ModelSetup({ canStart, progress, onDownload, onCancel, onImport }: {
  canStart: boolean; progress: number | undefined; onDownload: () => void; onCancel: () => void; onImport: () => void;
}) {
  const { colors } = useTheme();
  const downloading = progress !== undefined;
  return (
    <View>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Cloning needs the Pocket TTS voice engine, a large one-time download (Wi-Fi recommended). The standard Piper, Kokoro and KittenTTS voices cannot clone a new voice.</Text>
      {downloading ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.note, styles.flex, { color: colors.textSecondary }]}>{progress >= 0 ? `Downloading ${Math.round(progress * 100)}%` : 'Downloading...'}</Text>
          <TouchableOpacity style={styles.action} onPress={onCancel} testID="voice-clone-cancel-download"><Text style={{ color: colors.primary }}>Cancel</Text></TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.action} onPress={onDownload} disabled={!canStart} testID="voice-clone-download-model">
          <Text style={{ color: canStart ? colors.primary : colors.textMuted }}>Download the voice engine</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.action} onPress={onImport} disabled={!canStart || downloading} testID="voice-clone-import-model">
        <Text style={{ color: canStart && !downloading ? colors.primary : colors.textMuted }}>I already have the file: import it</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Tells the person when the active voice is already a cloned one. */
function ClonedVoiceNote() {
  const { colors } = useTheme();
  const voice = useAtlasVoiceStore((s) => s.neuralVoice);
  const reference = useAtlasVoiceStore((s) => s.neuralReferenceId);
  if (!reference || !voice || !isPocketVoiceId(voice)) return null;
  return <Text style={[styles.note, { color: colors.textSecondary }]}>Currently using a cloned voice. Change it using Voice profiles or the picker above.</Text>;
}

/** The first thing still missing before a voice can be created, in plain words, or '' when nothing is. */
function blocker(f: { available: boolean; consent: boolean; model: string; hasSample: boolean; name: string; busy: boolean; recording: boolean }): string {
  if (!f.available) return 'Cloning needs the Android version of Atlas with the voice engine.';
  if (!f.consent) return 'Turn on the permission switch above first.';
  if (!f.model) return 'Install the Pocket TTS model in step 1 first.';
  if (!f.hasSample) return 'Record or choose a voice sample in step 2 first.';
  if (f.recording) return 'Stop the recording first.';
  if (f.busy) return 'Working...';
  if (!f.name.trim()) return 'Give the voice a name in step 3.';
  return '';
}

/** A numbered section of the cloning flow. */
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>{number}. {title}</Text>
      {children}
    </View>
  );
}

type Sample = ReturnType<typeof useVoiceSample>;

/** Step 2: record or choose a sample, pick one of the saved samples, and check its quality. */
function SampleStep({ sample, consent, busy, canTry, onError }: { sample: Sample; consent: boolean; busy: boolean; canTry: boolean; onError: (e: unknown) => void }) {
  const { colors } = useTheme();
  const [checkOpen, setCheckOpen] = useState(false);
  const canChoose = consent && !busy && !sample.recording;
  return (
    <Step number={2} title="Add a voice sample">
      <Text style={[styles.note, { color: colors.textSecondary }]}>Record about 10 seconds of clear speech, or choose any audio file (MP3, M4A, WAV and more). A long file is fine: Atlas picks the clearest 20 seconds. To make another voice, add a new sample here, give it a new name in step 3 and press Create voice. Your earlier voices stay.</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.action} testID="voice-clone-record" disabled={!consent || busy} onPress={sample.recording ? sample.stopRecording : sample.startRecording}>
          <Text style={{ color: colors.primary }}>{sample.recording ? 'Stop and save' : 'Record'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} testID="voice-clone-import-audio" disabled={!canChoose} onPress={sample.chooseFile}>
          <Text style={{ color: colors.primary }}>Choose audio file</Text>
        </TouchableOpacity>
      </View>
      {sample.recording && <Text style={{ color: colors.textSecondary }}>Recording: {sample.recordSeconds}s. Speak clearly. Press Stop when done.</Text>}
      <SampleList references={sample.references} selectedId={sample.selected?.id ?? ''} onSelect={sample.choose} onError={onError} />
      {!!sample.selected && (
        <TouchableOpacity onPress={() => setCheckOpen((v) => !v)} accessibilityRole="button">
          <Text style={{ color: colors.primary }}>{checkOpen ? 'Hide sample check' : 'Check sample quality'}</Text>
        </TouchableOpacity>
      )}
      {checkOpen && !!sample.selected && <SampleCheck canRun={canTry} quality={sample.quality} onAnalyze={sample.check} onImprove={sample.improve} />}
    </Step>
  );
}

/** Step 4: the Create voice button, with the reason it cannot be pressed yet. */
function CreateStep({ why, onCreate }: { why: string; onCreate: () => void }) {
  const { colors } = useTheme();
  return (
    <Step number={4} title="Create the voice">
      <TouchableOpacity style={[styles.primary, { backgroundColor: why ? colors.border : colors.primary }]} testID="voice-clone-create" disabled={!!why} onPress={onCreate} accessibilityRole="button">
        <Text style={[styles.primaryText, { color: why ? colors.textMuted : colors.background }]}>Create voice</Text>
      </TouchableOpacity>
      {!!why && <Text style={[styles.note, { color: colors.textSecondary }]}>{why}</Text>}
    </Step>
  );
}

/** Voice cloning is strictly local, opt-in, and requires a compatible PocketTTS ONNX model. */
export function VoiceCloneCard() {
  const { colors } = useTheme();
  const installed = useNeuralVoices((s) => s.installed);
  const model = Object.keys(installed).filter(isPocketVoiceId)[0] ?? '';
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [busyModel, setBusyModel] = useState(false);
  const available = Platform.OS === 'android' && !!NativeModules.AtlasTts?.importVoiceReference;
  const fail = (e: unknown) => Alert.alert('Voice cloning', String((e as any)?.message || e));
  const sample = useVoiceSample(name, fail);
  const [rate, setRate] = useState(1);
  const make = useVoiceCreation({ model, reference: sample.selected, name, rate, onError: fail });
  const busy = sample.busy || make.busy || busyModel;
  const why = blocker({ available, consent, model, hasSample: !!sample.selected, name, busy, recording: sample.recording });
  const canTry = !!sample.selected && !!model && consent && !busy && !sample.recording;

  const modelId = voiceIdForName(MODEL_URL);
  const modelProgress = useNeuralVoices((st) => st.progress[modelId]);
  const downloadModel = async () => {
    try { await downloadVoicePackage(MODEL_URL, MODEL_URL.split('/').pop()!); }
    catch (e: any) { if (!/cancel/i.test(String(e?.message || e?.code))) fail(e); }
  };
  const importModel = async () => {
    setBusyModel(true);
    try { await importVoiceFile(); } catch (e: any) { if (!/cancel/i.test(String(e?.message || e?.code))) fail(e); } finally { setBusyModel(false); }
  };

  return (
    <View testID="voice-clone-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Clone a voice</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>
        Make a copy of a voice from a short sample. It runs on this phone with no upload. Then use it for an agent, phone calls or reading aloud.
      </Text>
      <View style={styles.row}>
        <Switch testID="voice-clone-consent" value={consent} onValueChange={setConsent} disabled={sample.recording} />
        <Text style={[styles.note, styles.flex, { color: colors.text }]}>I own this voice or have permission to copy it. Samples stay on your phones; nothing is uploaded.</Text>
      </View>
      {!available && <Text style={[styles.note, { color: colors.textSecondary }]}>{blocker({ available, consent, model, hasSample: false, name, busy, recording: false })}</Text>}
      {available && (
        <>
          <Step number={1} title="Install the voice engine (once)">
            {model ? <Text style={[styles.note, { color: colors.textSecondary }]}>Installed.</Text>
              : <ModelSetup canStart={consent && !busy} progress={modelProgress} onDownload={downloadModel} onCancel={() => cancelVoiceDownload(modelId)} onImport={importModel} />}
          </Step>
          <SampleStep sample={sample} consent={consent} busy={busy} canTry={canTry} onError={fail} />
          <Step number={3} title="Name it and try it">
            <TextInput testID="voice-clone-name" value={name} onChangeText={setName} placeholder="Voice name, for example Mom" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
            <TouchableOpacity style={styles.action} testID="voice-clone-preview" disabled={!canTry} onPress={make.tryIt}>
              <Text style={{ color: canTry ? colors.primary : colors.textMuted }}>Try the voice</Text>
            </TouchableOpacity>
            <Text style={[styles.note, { color: colors.textSecondary }]}>Speed of this voice (you can change it later in Voice profiles).</Text>
            <View style={styles.row}>
              {SPEEDS.map((n) => (
                <TouchableOpacity key={n} onPress={() => setRate(n)} accessibilityRole="radio" accessibilityState={{ selected: rate === n }} testID={`voice-clone-speed-${n}`}
                  style={[styles.action, { borderColor: rate === n ? colors.primary : colors.border }]}>
                  <Text style={{ color: colors.text }}>{n}x</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!make.status && <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={[styles.note, styles.flex, { color: colors.textSecondary }]}>{make.status}</Text></View>}
          </Step>
          <CreateStep why={why} onCreate={() => { make.create().then((made) => { if (made) setName(''); }).catch(fail); }} />
          <Advanced colors={colors} steps={make.steps} onSteps={make.changeSteps} canTest={canTry} onSpeedTest={make.speedTest} result={make.benchmark} />
          <ClonedVoiceNote />
        </>
      )}
    </View>
  );
}

/** Quality setting and the phone-call speed test. */
function Advanced({ colors, steps, onSteps, canTest, onSpeedTest, result }: {
  colors: { text: string; border: string; primary: string; textSecondary: string };
  steps: number; onSteps: (n: number) => void; canTest: boolean; onSpeedTest: () => void; result: string;
}) {
  return (
    <View style={styles.step}>
      <Text style={[styles.stepTitle, { color: colors.text }]}>Speed or quality</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Faster settings sound a little less detailed. Fast is best for phone calls.</Text>
      <View style={styles.row}>
        {STEPS.map((n) => (
          <TouchableOpacity key={n} onPress={() => onSteps(n)} accessibilityRole="radio" accessibilityState={{ selected: steps === n }}
            style={[styles.action, { borderColor: steps === n ? colors.primary : colors.border }]}>
            <Text style={{ color: colors.text }}>{STEP_LABELS[n]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.action} testID="voice-clone-benchmark" disabled={!canTest} onPress={onSpeedTest}>
        <Text style={{ color: canTest ? colors.primary : colors.textSecondary }}>Test speed for phone calls</Text>
      </TouchableOpacity>
      {!!result && <Text style={[styles.note, { color: colors.textSecondary }]}>{result}</Text>}
    </View>
  );
}

/** Neutral outline for the action buttons; chosen options override it with the theme colors. */
const ACTION_BORDER = '#777777';

const styles = StyleSheet.create({
  card: { borderRadius: 10, padding: 14, marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  note: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  action: { borderWidth: 1, borderColor: ACTION_BORDER, borderRadius: 8, padding: 10 },
  step: { marginTop: 16, gap: 8 },
  stepTitle: { fontSize: 15, fontWeight: '600' },
  primary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600' },
  wizard: { marginTop: 12, padding: 10, borderRadius: 9, borderWidth: 1 },
  strong: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 9, marginTop: 12 },
  flex: { flex: 1 },
});
