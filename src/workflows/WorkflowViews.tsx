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
import type { InputField } from './engine';

export type Kind = string;
const titleOf = (id: string): string => workflowList().find((w) => w.id === id)?.title ?? 'Job';
const fail = (title: string) => (e: unknown) => Alert.alert(title, String((e as Error)?.message || e));

const Shell: React.FC<{ title: string; onBack: (() => void) | undefined; children: React.ReactNode }> = ({ title, onBack, children }) => {
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
        <TouchableOpacity key={w.id} onPress={() => onPick(w.id)} testID={`workflow-${w.id}`} accessibilityRole="button">
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
  kind: Kind; text: string; setText: (t: string) => void; fields: Record<string, string>; setField: (id: string, value: string) => void;
  recordings: Array<{ id: string; title: string }>; busy: boolean; onFile: () => void; onStart: () => void; onBack: () => void;
}

const FieldRow: React.FC<{ field: InputField; value: string; onChange: (v: string) => void }> = ({ field, value, onChange }) => {
  const { colors } = useTheme();
  if (!field.options) {
    return <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={value} onChangeText={onChange} placeholder={field.placeholder ?? field.label} placeholderTextColor={colors.textMuted} testID={`workflow-field-${field.id}`} />;
  }
  return (
    <View>
      <Text style={[styles.note, { color: colors.textSecondary }]}>{field.label}</Text>
      <View style={styles.chips}>
        {field.options.map((o) => (
          <TouchableOpacity key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ selected: value === o }} testID={`workflow-field-${field.id}-${o}`}
            style={[styles.chip, { borderColor: value === o ? colors.primary : colors.border }]}>
            <Text style={{ color: colors.text }}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

/** Where the text for a job comes from, any extra choices it asks for, and the start button. */
export const InputView: React.FC<InputProps> = (p) => {
  const { colors } = useTheme();
  const input = workflowList().find((w) => w.id === p.kind)!.input;
  return (
    <Shell title={titleOf(p.kind)} onBack={p.onBack}>
      <Text style={[styles.note, { color: colors.textSecondary }]}>{input.help}</Text>
      {(input.fields ?? []).map((f) => <FieldRow key={f.id} field={f} value={p.fields[f.id] ?? ''} onChange={(v) => p.setField(f.id, v)} />)}
      <TextInput style={[styles.input, styles.big, { color: colors.text, borderColor: colors.border }]} value={p.text} onChangeText={p.setText} multiline textAlignVertical="top"
        placeholder={input.placeholder ?? 'Paste text here'} placeholderTextColor={colors.textMuted} testID="workflow-text" />
      {input.fromRecording && p.recordings.map((r) => (
        <TouchableOpacity key={r.id} onPress={() => { p.setText(recorderService.transcript(r.id)); p.setField('title', r.title); }} style={styles.row} testID={`workflow-rec-${r.id}`}>
          <Text style={{ color: colors.primary }}>Use recording: {r.title}</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.chips}>
        <Button title="Choose a file" variant="outline" onPress={p.onFile} disabled={p.busy} />
        <Button title="Start" onPress={p.onStart} disabled={p.busy || p.text.trim().length < input.minChars} testID="workflow-start" />
      </View>
      {p.busy && <ActivityIndicator color={colors.primary} />}
    </Shell>
  );
};

type AnyRun = { id: string; workflowId: string; status: string; log: string[]; error?: string; ctx: any; waiting?: { kind: string; title: string; summary?: string; questions?: Array<{ id: string; text: string; options?: string[] }> } };
interface RunProps {
  run: AnyRun; busy: boolean; answers: Record<string, string>; setAnswers: (fn: (a: Record<string, string>) => Record<string, string>) => void;
  onContinue: () => void; onApprove: () => void; onCancel: () => void; onBack: () => void; onResume: () => void;
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
      {!!note && <Button title="Save the note" testID="workflow-save-note" onPress={() => { saveMarkdown(`${run.workflowId}-note.md`, note).catch(fail('Could not save')); }} />}
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
      {(run.status === 'failed' || run.status === 'running') && !p.busy && (
        <Button title={run.status === 'failed' ? 'Try this step again' : 'Carry on'} variant="outline" testID="workflow-resume" onPress={p.onResume} />
      )}
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
