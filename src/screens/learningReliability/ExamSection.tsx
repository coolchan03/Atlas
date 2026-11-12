import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { useLearningStore } from '../../learning/store';
import { GENERAL_NAME, NO_AGENT } from '../../learning/agents';
import { exams, runExamNow } from '../../learning/engine';
import { EXAM_MODE_LABEL, parseExpected, type ExamResult } from '../../learning/exams';
import { sectionStyles as s } from './sectionStyles';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One line for one run: right answers, outdated figures, unsupported citations, speed and memory. */
export function describeResult(r: ExamResult): string {
  const m = r.metrics;
  return `${EXAM_MODE_LABEL[r.mode]}: ${pct(m.accuracy)} right (${m.correct} of ${m.total}), ${m.outdatedAnswers} out of date, ${m.unsupportedCitations} unsupported citations, ${m.averageSeconds.toFixed(1)}s each${m.memoryMB ? `, ${Math.round(m.memoryMB)} MB` : ''}`;
}

const History: React.FC<{ history: ExamResult[] }> = ({ history }) => {
  const { colors } = useTheme();
  if (!history.length) return null;
  return (
    <View testID="exam-history">
      <Text style={[s.title, { color: colors.text }]}>Results so far</Text>
      {history.map((r) => (
        <Text key={r.id} style={[s.small, { color: colors.textSecondary }]}>{new Date(r.at).toLocaleDateString()} · {describeResult(r)}</Text>
      ))}
      <Text style={[s.small, { color: colors.textMuted }]}>Answers are checked against the facts you wrote, not by the model. Memory use is read from the phone; processor use is not measured.</Text>
    </View>
  );
};

/** The exam: questions with the facts a right answer must contain, run in three ways so retrieval and memory can be measured. */
export const ExamSection: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { colors } = useTheme();
  const experts = useLearningStore((st) => st.experts);
  const [subject, setSubject] = useState(NO_AGENT);
  const [question, setQuestion] = useState('');
  const [facts, setFacts] = useState('');
  const [forbid, setForbid] = useState('');
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const subjects = [{ id: NO_AGENT, name: GENERAL_NAME }, ...experts];
  const { items, history } = useMemo(() => ({ items: exams.items(subject), history: exams.history(9) }), [subject, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    const expected = parseExpected(facts, forbid);
    if (!question.trim() || !expected.facts.length) { Alert.alert('Needs a question and an answer', 'Write the question and at least one fact a right answer must contain.'); return; }
    exams.addItem({ subjectId: subject, topic: useLearningStore.getState().getConfig(subject).topic, question, expected });
    setQuestion(''); setFacts(''); setForbid(''); setVersion((v) => v + 1);
  };
  const run = async () => {
    setRunning(true);
    try { await runExamNow(subject, setStatus); } catch (e: any) { Alert.alert('Exam', String(e?.message || e)); } finally { setRunning(false); setStatus(''); setVersion((v) => v + 1); onChanged(); }
  };
  const field = [s.input, { color: colors.text, borderColor: colors.border }];
  return (
    <View style={[s.card, { borderColor: colors.border }]} testID="exam-section">
      <Text style={[s.title, { color: colors.text }]}>Exam</Text>
      <Text style={[s.note, { color: colors.textSecondary }]}>
        Questions here are never studied by the learner. The same questions are answered by the model alone, with sources, and with sources and stored memory, then compared.
      </Text>
      <View style={s.row}>
        {subjects.map((x) => (
          <TouchableOpacity key={x.id} onPress={() => setSubject(x.id)} accessibilityRole="radio" accessibilityState={{ selected: subject === x.id }}
            style={[s.chip, { borderColor: subject === x.id ? colors.primary : colors.border, backgroundColor: subject === x.id ? colors.primary : colors.surface }]}>
            <Text style={{ color: subject === x.id ? colors.background : colors.text }}>{x.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {items.map((i) => (
        <View key={i.id} style={s.row}>
          <Text style={[s.note, s.grow, { color: colors.text }]}>{i.question}</Text>
          <TouchableOpacity onPress={() => { exams.removeItem(i.id); setVersion((v) => v + 1); }} accessibilityLabel={`Remove ${i.question}`}><Text style={{ color: colors.error }}>Remove</Text></TouchableOpacity>
        </View>
      ))}
      <TextInput testID="exam-question" value={question} onChangeText={setQuestion} placeholder="Exam question" placeholderTextColor={colors.textMuted} style={field} />
      <TextInput testID="exam-facts" value={facts} onChangeText={setFacts} multiline placeholder={'Facts a right answer must contain, one per line.\nSeparate other wordings with |  (one minute | 1 minute)'} placeholderTextColor={colors.textMuted} style={[...field, s.multiline]} />
      <TextInput testID="exam-forbid" value={forbid} onChangeText={setForbid} placeholder="Must not say (optional, separate with commas)" placeholderTextColor={colors.textMuted} style={field} />
      <View style={s.row}>
        <TouchableOpacity onPress={add} style={[s.button, { borderColor: colors.primary }]} accessibilityRole="button" testID="exam-add"><Text style={{ color: colors.primary }}>Add question</Text></TouchableOpacity>
        <TouchableOpacity onPress={run} disabled={running || !items.length} style={[s.button, { borderColor: running || !items.length ? colors.border : colors.primary }]} accessibilityRole="button" testID="exam-run">
          {running ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: items.length ? colors.primary : colors.textMuted }}>Run the exam</Text>}
        </TouchableOpacity>
      </View>
      {!!status && <Text style={[s.small, { color: colors.textSecondary }]}>{status}</Text>}
      <History history={history} />
    </View>
  );
};
