import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { Button, Card } from '../components';
import { recorderService } from '../atlasRecorder/recorderService';
import { saveMarkdown, saveText } from '../study/exportFiles';
import { workflowList } from './service';

export type Kind = 'accountant' | 'meeting' | 'bill';
export const INPUT_HELP: Record<Kind, string> = {
  accountant: 'Paste the text of a bank statement, or choose a file. Include the opening and closing balance so the total can be checked.',
  meeting: 'Paste a transcript, or choose one of your recordings.',
  bill: 'Paste the text of a bill or warranty, or choose a file.',
};
export const titleOf = (id: string): string => workflowList().find((w) => w.id === id)?.title ?? 'Job';
const fail = (title: string) => (e: unknown) => Alert.alert(title, String((e as Error)?.message || e));

export const Shell: React.FC<{ title: string; onBack: (() => void) | undefined; children: React.ReactNode }> = ({ title, onBack, children }) => {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenBackground screenKey="Workflows" />
      <ScreenHeader title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </SafeAreaView>
  );
};


/** The list of jobs and the recent runs. */
export const JobList: React.FC<{ runs: Array<{ id: string; workflowId: string; status: string }>; onPick: (kind: Kind) => void; onOpen: (id: string) => void }> = ({ runs, onPick, onOpen }) => {
  const { colors } = useTheme();
  return (
    <Shell title="Multi-step helpers" onBack={undefined}>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Each helper works through fixed steps, shows you the result and waits for your approval before it saves or schedules anything. The AI reads and suggests; plain code checks the numbers and dates.</Text>
      {workflowList().map((w) => (
        <TouchableOpacity key={w.id} onPress={() => onPick(w.id as Kind)} testID={`workflow-${w.id}`} accessibilityRole="button">
          <Card style={styles.card}>
            <Text style={[styles.h, { color: colors.text }]}>{w.title}</Text>
            <Text style={{ color: colors.textSecondary }}>{w.summary}</Text>
          </Card>
        </TouchableOpacity>
      ))}
      {runs.length > 0 && <Text style={[styles.h, { color: colors.text }]}>Recent</Text>}
      {runs.map((r) => (
        <TouchableOpacity key={r.id} onPress={() => onOpen(r.id)} style={styles.row} testID={`workflow-run-${r.id}`}>
          <Text style={{ color: colors.text }}>{titleOf(r.workflowId)} · {r.status}</Text>
        </TouchableOpacity>
      ))}
    </Shell>
  );
};

interface InputProps {
  kind: Kind; text: string; setText: (t: string) => void; title: string; setTitle: (t: string) => void; days: number; setDays: (n: number) => void;
  recordings: Array<{ id: string; title: string }>; busy: boolean; onFile: () => void; onStart: () => void; onBack: () => void;
}
/** Where the text for a job comes from, and the start button. */
export const InputView: React.FC<InputProps> = (p) => {
  const { colors } = useTheme();
  const box = { color: colors.text, borderColor: colors.border };
  return (
    <Shell title={titleOf(p.kind)} onBack={p.onBack}>
      <Text style={[styles.note, { color: colors.textSecondary }]}>{INPUT_HELP[p.kind]}</Text>
      {p.kind === 'meeting' && <TextInput style={[styles.input, box]} value={p.title} onChangeText={p.setTitle} placeholder="Meeting name" placeholderTextColor={colors.textMuted} testID="workflow-title" />}
      <TextInput style={[styles.input, styles.big, box]} value={p.text} onChangeText={p.setText} multiline textAlignVertical="top" placeholder="Paste text here" placeholderTextColor={colors.textMuted} testID="workflow-text" />
      {p.kind === 'meeting' && p.recordings.map((r) => (
        <TouchableOpacity key={r.id} onPress={() => { p.setText(recorderService.transcript(r.id)); p.setTitle(r.title); }} style={styles.row} testID={`workflow-rec-${r.id}`}>
          <Text style={{ color: colors.primary }}>Use recording: {r.title}</Text>
        </TouchableOpacity>
      ))}
      {p.kind === 'bill' && (
        <View style={styles.chips}>
          {[1, 3, 7].map((n) => (
            <TouchableOpacity key={n} onPress={() => p.setDays(n)} accessibilityRole="radio" accessibilityState={{ selected: p.days === n }} style={[styles.chip, { borderColor: p.days === n ? colors.primary : colors.border }]}>
              <Text style={{ color: colors.text }}>Remind me {n} day{n === 1 ? '' : 's'} before</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.chips}>
        <Button title="Choose a file" variant="outline" onPress={p.onFile} disabled={p.busy} />
        <Button title="Start" onPress={p.onStart} disabled={p.busy || p.text.trim().length < 20} testID="workflow-start" />
      </View>
      {p.busy && <ActivityIndicator color={colors.primary} />}
    </Shell>
  );
};

type AnyRun = { id: string; workflowId: string; status: string; log: string[]; error?: string; ctx: any; waiting?: { kind: string; title: string; summary?: string; questions?: Array<{ id: string; text: string; options?: string[] }> } };
interface RunProps {
  run: AnyRun; busy: boolean; answers: Record<string, string>; setAnswers: (fn: (a: Record<string, string>) => Record<string, string>) => void;
  onContinue: () => void; onApprove: () => void; onCancel: () => void; onBack: () => void;
}

const Questions: React.FC<RunProps> = ({ run, busy, answers, setAnswers, onContinue }) => {
  const { colors } = useTheme();
  return (
    <View testID="workflow-questions">
      <Text style={[styles.h, { color: colors.text }]}>{run.waiting!.title}</Text>
      {run.waiting!.questions!.map((q) => (
        <Card key={q.id} style={styles.card}>
          <Text style={{ color: colors.text }}>{q.text}</Text>
          <View style={styles.chips}>
            {(q.options ?? []).map((o) => (
              <TouchableOpacity key={o} onPress={() => setAnswers((a) => ({ ...a, [q.id]: o }))} accessibilityRole="radio" accessibilityState={{ selected: answers[q.id] === o }}
                style={[styles.chip, { borderColor: answers[q.id] === o ? colors.primary : colors.border }]} testID={`answer-${q.id}-${o}`}>
                <Text style={{ color: colors.text }}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      ))}
      <Button title="Continue" disabled={busy} testID="workflow-continue" onPress={onContinue} />
    </View>
  );
};

/** The finished job: what it made, and the buttons to keep it. */
const Done: React.FC<{ run: AnyRun }> = ({ run }) => {
  const { colors } = useTheme();
  const { csv, note, reminded, reminders } = run.ctx;
  return (
    <>
      {!!csv && <Button title="Save the CSV" testID="workflow-save-csv" onPress={() => { saveText('bank-statement.csv', csv).catch(fail('Could not save')); }} />}
      {!!note && <Button title="Save the note" testID="workflow-save-note" onPress={() => { saveMarkdown('meeting-notes.md', note).catch(fail('Could not save')); }} />}
      {!!reminded && <Text style={{ color: colors.text }}>The reminder is set. You can see it under Scheduled tasks.</Text>}
      {!!reminders && <Text style={{ color: colors.text }}>{reminders} reminder{reminders === 1 ? '' : 's'} set under Scheduled tasks.</Text>}
    </>
  );
};

/** One run: its steps so far, then whatever it needs next (answers, approval, or the saved result). */
export const RunView: React.FC<RunProps> = (p) => {
  const { colors } = useTheme();
  const { run } = p;
  return (
    <Shell title={titleOf(run.workflowId)} onBack={p.onBack}>
      {run.log.map((line, i) => <Text key={i} style={[styles.log, { color: colors.textSecondary }]}>{line}</Text>)}
      {p.busy && <ActivityIndicator color={colors.primary} />}
      {run.status === 'failed' && <Text style={[styles.error, { color: colors.error }]} testID="workflow-error">{run.error}</Text>}
      {run.status === 'waiting' && run.waiting?.kind === 'ask' && <Questions {...p} />}
      {run.status === 'waiting' && run.waiting?.kind === 'confirm' && (
        <View testID="workflow-confirm">
          <Text style={[styles.h, { color: colors.text }]}>{run.waiting.title}</Text>
          <Text style={{ color: colors.text }}>{run.waiting.summary}</Text>
          <View style={styles.chips}>
            <Button title="Approve" disabled={p.busy} testID="workflow-approve" onPress={p.onApprove} />
            <Button title="Cancel" variant="outline" onPress={p.onCancel} />
          </View>
        </View>
      )}
      {run.status === 'done' && <Done run={run} />}
    </Shell>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80, gap: SPACING.md },
  note: { ...TYPOGRAPHY.bodySmall },
  h: { ...TYPOGRAPHY.h3 },
  card: { marginBottom: SPACING.sm },
  log: { ...TYPOGRAPHY.bodySmall },
  error: { ...TYPOGRAPHY.body },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  big: { minHeight: 180 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  row: { paddingVertical: SPACING.sm },
});
