import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { coverageFor, type TopicCoverage } from './coverage';
import type { ExamCode } from './blueprints';

const WORDS = { good: 'Covered', thin: 'Thin', none: 'Not in your documents' } as const;

/** A report of which checklist topics your documents cover well, thinly, or not at all, so you know where to add a book. */
export function CoverageCard({ code }: { code: ExamCode }) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<TopicCoverage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setRows(await coverageFor(code)); } finally { setBusy(false); } };
  const gaps = (rows ?? []).filter((r) => r.level !== 'good');
  return (
    <Card style={styles.card} testID="cpa-coverage">
      <Text style={[styles.title, { color: colors.text }]}>Do your documents cover it?</Text>
      <Text style={{ color: colors.textSecondary }}>Checks every topic on the checklist against the textbooks and notes in your folder. A topic with nothing behind it would be written from the AI's own memory.</Text>
      <Button title={busy ? 'Checking...' : 'Check coverage'} variant="outline" onPress={run} disabled={busy} testID="cpa-coverage-run" />
      {busy && <ActivityIndicator color={colors.primary} />}
      {rows && (
        <View style={styles.list} testID="cpa-coverage-result">
          <Text style={{ color: colors.text }}>{rows.length - gaps.length} of {rows.length} topics are covered by two or more books.</Text>
          {gaps.map((r) => (
            <Text key={`${r.area}-${r.topic}`} style={{ color: r.level === 'none' ? colors.error : colors.textSecondary }}>
              {r.topic}: {WORDS[r.level]}{r.level === 'thin' ? ` (${r.books} book${r.books === 1 ? '' : 's'}, ${r.passages} passage${r.passages === 1 ? '' : 's'})` : ''}{r.law ? ', the law or standard covers it' : ''}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: SPACING.sm }, title: { ...TYPOGRAPHY.h3 }, list: { gap: SPACING.xs } });
