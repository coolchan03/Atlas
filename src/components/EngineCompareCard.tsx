/** "Compare with GenieX": runs the same short prompts through llama.rn and GenieX on this phone and says whether GenieX is worth using. Shown only in a build that has GenieX on a chip it supports. */
import { SPACING, TYPOGRAPHY } from '../constants';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useTheme } from '../theme';
import { geniexStatus, geniexUsable } from '../services/geniexEngine';
import { COMPARE_PROMPTS, geniexHandle, llamaHandle } from '../services/engineHandles';
import { measureEngine, roundsNeeded } from '../services/engineCompare';
import { compareEngines, type Comparison, type EngineRun } from '../services/engineBenchmark';
import type { LlamaDownloadedModel as DownloadedModel } from '../types';

const PROMPTS = COMPARE_PROMPTS;

const fmt = (r: EngineRun) => `${r.engine}: writes ${r.decodeTps.toFixed(1)} per second, first words after ${r.firstTokenSec.toFixed(2)} s, loads in ${r.coldLoadSec.toFixed(1)} s, ${Math.round(r.peakRamMB)} MB (${r.runs} replies)`;

export const EngineCompareCard: React.FC<{ model: DownloadedModel }> = ({ model }) => {
  const { colors } = useTheme();
  const [usable, setUsable] = useState(false);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ a: EngineRun; b: EngineRun; verdict: Comparison } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { geniexStatus().then((s) => setUsable(geniexUsable(s))).catch(() => setUsable(false)); }, []);
  if (!usable) return null;
  const run = async () => {
    setBusy('Measuring llama.rn...'); setError(''); setResult(null);
    try {
      const rounds = roundsNeeded(PROMPTS.length);
      const setup = { device: DeviceInfo.getModel?.() || 'this phone', model: model.fileName, quant: /q4_0/i.test(model.fileName) ? 'Q4_0' : (model.fileName.match(/(?:^|[-_.])(i?q\d\w*|f16|bf16)(?=\.gguf$|$)/i)?.[1] ?? 'unknown').toUpperCase(), contextLength: 4096, features: { vision: false, tools: true, mtp: false, qLegacy: true }, licenceOk: true };
      const a = await measureEngine(llamaHandle(model), setup, { prompts: PROMPTS, rounds });
      setBusy('Measuring GenieX...');
      const b = await measureEngine(geniexHandle(model), setup, { prompts: PROMPTS, rounds });
      setResult({ a, b, verdict: compareEngines(a, b) });
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };
  return (
    <View style={[styles.card, { borderColor: colors.border }]} testID="engine-compare">
      <Text style={[styles.title, { color: colors.text }]}>Compare with GenieX</Text>
      <Text style={{ color: colors.textSecondary }}>Unloads the model, then loads it in llama.rn and in Qualcomm GenieX one after the other and writes the same {PROMPTS.length} short answers {roundsNeeded(PROMPTS.length)} times in each. Reload your model afterwards. GenieX here does text only (no pictures or tools yet).</Text>
      <TouchableOpacity onPress={run} disabled={!!busy} testID="engine-compare-start" style={[styles.button, { borderColor: colors.primary }]}>
        {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary }}>{result ? 'Compare again' : 'Compare engines'}</Text>}
      </TouchableOpacity>
      {!!busy && <Text style={{ color: colors.textMuted }}>{busy}</Text>}
      {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
      {!!result && (
        <View testID="engine-compare-result">
          <Text style={{ color: colors.textSecondary }}>{fmt(result.a)}</Text>
          <Text style={{ color: colors.textSecondary }}>{fmt(result.b)}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{result.verdict.verdict === 'replace' ? 'GenieX is clearly faster here' : result.verdict.verdict === 'keep' ? 'Keep llama.rn' : result.verdict.verdict === 'need-more-runs' ? 'Too few replies to say' : 'Not comparable'}</Text>
          {result.verdict.reasons.map((r) => <Text key={r} style={{ color: colors.textSecondary }}>{r}</Text>)}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  title: { ...TYPOGRAPHY.h2 },
  button: { borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, alignItems: 'center' },
});
