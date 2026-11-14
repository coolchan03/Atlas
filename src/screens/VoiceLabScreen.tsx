import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Clipboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { ReadVoiceChooser } from '../atlasVoice/ReadVoiceChooser';
import {
  DEFAULT_LAB_TEXT, LAB_STEPS, LabReport, findings, formatReport, labAvailable, playThroughVoice, playWithAndroid, runVoiceLab, stopLab,
} from '../atlasVoice/voiceLab';

/** Hidden screen (tap the version in About seven times): a deeper test of the cloning voice. */
export const VoiceLabScreen: React.FC = () => {
  const { colors } = useTheme();
  const [text, setText] = useState(DEFAULT_LAB_TEXT);
  const [steps, setSteps] = useState<number[]>(LAB_STEPS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ report: LabReport; voice: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const toggle = (n: number) => setSteps((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((a, b) => a - b)));
  const run = useCallback(async () => {
    setBusy(true); setError(''); setCopied(false);
    try {
      const out = await runVoiceLab(text.trim() || DEFAULT_LAB_TEXT, steps);
      setResult({ ...out, text: text.trim() || DEFAULT_LAB_TEXT });
    } catch (e) { setError((e as Error)?.message || 'The lab failed'); }
    finally { setBusy(false); }
  }, [text, steps]);
  const play = (fn: (p: string) => Promise<boolean>, path: string) => { fn(path).catch((e: Error) => setError(e?.message || 'Could not play it')); };
  const runDisabled = busy || !steps.length || !labAvailable();
  const small = [styles.small, { color: colors.textSecondary }];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Voice lab" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={small}>
          Makes the same sentence with the cloned voice at several quality steps, saves each as a WAV file, and measures it. Play each file two ways: if it sounds
          clean with Android's player but glitches through the voice output, the problem is playback; if it glitches both ways, it is the voice.
        </Text>
        <Text style={[styles.label, { color: colors.text }]}>Voice (must have a recording)</Text>
        <ReadVoiceChooser />
        <Text style={[styles.label, { color: colors.text }]}>Sentence</Text>
        <TextInput testID="voice-lab-text" value={text} onChangeText={setText} multiline
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
        <Text style={[styles.label, { color: colors.text }]}>Quality steps to compare</Text>
        <View style={styles.row}>
          {LAB_STEPS.concat([8]).map((n) => (
            <TouchableOpacity key={n} onPress={() => toggle(n)} accessibilityRole="checkbox" accessibilityState={{ checked: steps.includes(n) }} testID={`voice-lab-step-${n}`}
              style={[styles.chip, { borderColor: steps.includes(n) ? colors.primary : colors.border, backgroundColor: steps.includes(n) ? colors.primary : colors.surface }]}>
              <Text style={{ color: steps.includes(n) ? colors.background : colors.text }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={run} disabled={runDisabled} testID="voice-lab-run" accessibilityRole="button"
          style={[styles.action, { borderColor: colors.primary }, runDisabled && styles.dim]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>Run the test</Text>}
        </TouchableOpacity>
        {!labAvailable() && <Text style={[styles.small, { color: colors.error }]}>The lab needs the Android app with the cloning voice.</Text>}
        {!!error && <Text style={[styles.small, { color: colors.error }]} testID="voice-lab-error">{error}</Text>}

        {result && (
          <View style={styles.results} testID="voice-lab-results">
            {result.report.runs.map((r) => (
              <View key={r.label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`voice-lab-run-${r.steps}`}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{r.label}</Text>
                {r.stats ? (
                  <>
                    <Text style={small}>
                      {r.millis} ms to make {r.stats.seconds.toFixed(2)} s · {r.audioRate} Hz (engine {r.engineRate}) · {r.stats.bursts} bursts · gap {r.stats.longestGapMs} ms · lead {r.stats.leadSilenceMs} ms · trail {r.stats.trailSilenceMs} ms · clipped {r.stats.clippedPercent.toFixed(1)}%
                    </Text>
                    <View style={styles.row}>
                      <TouchableOpacity onPress={() => play(playThroughVoice, r.path)} style={[styles.action, { borderColor: colors.primary }]} testID={`voice-lab-play-voice-${r.steps}`} accessibilityRole="button">
                        <Text style={{ color: colors.primary }}>Play through the voice</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => play(playWithAndroid, r.path)} style={[styles.action, { borderColor: colors.primary }]} testID={`voice-lab-play-android-${r.steps}`} accessibilityRole="button">
                        <Text style={{ color: colors.primary }}>Play with Android</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : <Text style={[styles.small, { color: colors.error }]}>Failed: {r.error}</Text>}
              </View>
            ))}
            <Text style={[styles.label, { color: colors.text }]}>What the numbers suggest</Text>
            {findings(result.report, result.text).map((x) => <Text key={x} style={small}>{'•'} {x}</Text>)}
            <Text style={small}>Files are in {result.report.folder}</Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => { Clipboard.setString(formatReport(result.report, result.text, result.voice)); setCopied(true); }} style={[styles.action, { borderColor: colors.border }]} testID="voice-lab-copy" accessibilityRole="button">
                <Text style={{ color: colors.text }}>{copied ? 'Copied' : 'Copy report'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { stopLab().catch(() => undefined); }} style={[styles.action, { borderColor: colors.border }]} testID="voice-lab-stop" accessibilityRole="button">
                <Text style={{ color: colors.text }}>Stop playing</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },
  label: { ...TYPOGRAPHY.h3 },
  small: { ...TYPOGRAPHY.bodySmall },
  input: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, minHeight: 64 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  dim: { opacity: 0.5 },
  results: { gap: SPACING.sm },
  card: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, gap: SPACING.sm },
  cardTitle: { ...TYPOGRAPHY.h3 },
});
