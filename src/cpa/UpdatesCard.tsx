import React, { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { appSearch } from '../topics/verifyLines';
import { digestTopics, newestBookYear, updatesSince, type Digest } from '../standards/digest';
import { useCpa } from './store';
import type { ExamCode } from './blueprints';

/** "What changed since my book": pages on the standard-setters' own sites that are newer than the newest book in the folder. */
export function UpdatesCard({ code }: { code: ExamCode }) {
  const { colors } = useTheme();
  const exam = useCpa((s) => s.exams[code]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async () => {
    const search = appSearch();
    if (!search) { setNote('Off-grid mode is on, so nothing is looked up online.'); setDigest(null); return; }
    setBusy(true); setNote('');
    try {
      const { ragService } = require('../services/rag');
      const names: string[] = exam?.projectId ? (await ragService.getDocumentsByProject(exam.projectId)).map((d: { name: string }) => d.name) : [];
      const fromNames = newestBookYear(names);
      const bookYear = fromNames ?? new Date().getFullYear() - 2;
      if (!fromNames) setNote(`None of your document names show a year, so this assumes your books are from ${bookYear}. Put the year in the file name (for example "Intermediate Accounting 2022") to be exact.`);
      setDigest(await updatesSince({ topics: digestTopics(code, (exam?.topics ?? []).map((t) => t.name)), bookYear, search }));
    } finally { setBusy(false); }
  };
  return (
    <Card style={styles.card} testID="cpa-updates">
      <Text style={[styles.title, { color: colors.text }]}>What changed since your books?</Text>
      <Text style={{ color: colors.textSecondary }}>Looks on the standard-setters' own sites (FASB, IRS, SEC) for pages newer than your newest book, on the topics that change. It lists what those sites show, with links, and does not judge what a change means.</Text>
      <Button title={busy ? 'Looking...' : 'Check for updates'} variant="outline" onPress={run} disabled={busy} testID="cpa-updates-run" />
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!note && <Text style={{ color: colors.textMuted }} testID="cpa-updates-note">{note}</Text>}
      {digest && (
        <View style={styles.list} testID="cpa-updates-result">
          {digest.offline && <Text style={{ color: colors.error }}>Could not reach the search (offline or blocked), so nothing was checked.</Text>}
          {!digest.offline && !digest.items.length && <Text style={{ color: colors.textSecondary }}>No newer page was found on those sites for these topics. That is not proof nothing changed: the search shows only some pages.</Text>}
          {digest.items.map((i) => (
            <View key={i.url}>
              <Text style={{ color: colors.primary }} accessibilityRole="link" onPress={() => Linking.openURL(i.url)}>{i.title}</Text>
              <Text style={{ color: colors.textMuted }}>{i.host} · {i.year} · {i.topic}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: 8 }, title: { fontSize: 16 }, list: { gap: 8 } });
