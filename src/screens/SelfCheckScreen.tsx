import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { useProjectStore } from '../stores/projectStore';
import { useCpa } from '../cpa/store';
import { defaultChecks, runChecks, summarize, type Check, type CheckResult } from '../diagnostics/selfCheck';

const ICON = { pass: 'check-circle', fail: 'x-circle', skip: 'minus-circle' } as const;

/** Tries each thing the app needs for studying on this phone and says what works, what does not and why. */
export const SelfCheckScreen: React.FC<{ checks?: Check[] }> = ({ checks }) => {
  const { colors } = useTheme();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const colorFor = (s: CheckResult['status']) => (s === 'pass' ? colors.primary : s === 'fail' ? colors.error : colors.textMuted);

  const run = async () => {
    setRunning(true); setDone(false); setResults([]);
    // The library check uses the CPA folder when there is one, else the first project.
    const projects = useProjectStore.getState().projects;
    const projectId = useCpa.getState().groupProjectId ?? projects[0]?.id;
    try { await runChecks(checks ?? defaultChecks(projectId), (r) => setResults((all) => [...all, r])); } finally { setRunning(false); setDone(true); }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Self-check" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Tries the pieces studying depends on, on this phone: the model, the search of your documents, reading scans, looking things up online, the voice, the lock-screen controls and free space. Nothing is changed or sent anywhere except one test search.</Text>
        <Button title={running ? 'Checking...' : 'Run the checks'} onPress={run} disabled={running} testID="selfcheck-run" />
        {running && <ActivityIndicator color={colors.primary} />}
        {done && <Text style={[styles.summary, { color: colors.text }]} testID="selfcheck-summary">{summarize(results)}</Text>}
        {results.map((r) => (
          <Card key={r.id} style={styles.card} testID={`selfcheck-${r.id}`}>
            <View style={styles.head}>
              <Icon name={ICON[r.status]} size={18} color={colorFor(r.status)} />
              <Text style={[styles.name, { color: colors.text }]}>{r.name}</Text>
            </View>
            <Text style={{ color: colors.textSecondary }}>{r.detail}</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 80 },
  note: { ...TYPOGRAPHY.bodySmall },
  summary: { ...TYPOGRAPHY.body },
  card: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...TYPOGRAPHY.h3 },
});
