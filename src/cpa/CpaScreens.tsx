import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button, Card } from '../components';
import { ScreenHeader } from '../components/ScreenHeader';
import { ragService } from '../services/rag';
import { useExerciseStore } from '../study/exercises';
import { pickAndAddFiles, pickAndAddFolder, summarize } from '../learning/documents';
import { QuestionImport } from '../screens/learningReliability/QuestionImport';
import { Fold } from '../components/Fold';
import { CPA_EXAMS, EXAM_FIELDS, OTHER_EXAMS, examInfo, examLabel, type ExamCode } from './blueprints';
import { addToPractice } from './importQuestions';
import { outlineFromText, outlineToText, parseOutline } from './outline';
import { describeEvidence, topicEvidence } from './progress';
import { describePace, pace, validDay } from './schedule';
import { CORE_CPA_CODES, organizeCpaInOneProject, setupAllCpaExams, setupCpaExam, stampExamScope } from './setup';
import { useCpa, type CpaTopic } from './store';
import { useTopics, courseProgress } from '../topics/store';
import { boardCovers, ensureExamCourse } from './course';

/** How many of an exam's topics are understood, from the practice results. */
function useExamStatus(code: ExamCode) {
  const exam = useCpa((s) => s.exams[code]);
  const exercises = useExerciseStore((s) => s.exercises);
  const progress = useExerciseStore((s) => s.progress);
  const courses = useTopics((s) => s.courses);
  return useMemo(() => {
    const board = courses.find((c) => c.id === exam?.courseId);
    const list = Object.values(exercises);
    const rows = (exam?.topics ?? []).map((t) => ({ topic: t, evidence: topicEvidence(list, progress, { topic: t.name, projectId: exam?.projectId, examCode: code }) }));
    return { exam, rows, understood: rows.filter((r) => r.evidence.status === 'understood').length, covered: rows.filter((r) => r.topic.covered || boardCovers(board, r.topic.name)).length, board,
      questions: list.filter((e) => e.examCode === code || (!e.examCode && !!exam?.projectId && e.projectId === exam.projectId)).length };
  }, [exam, exercises, progress, courses]);
}

/** The four exams, set up with one tap, each with its own documents, questions and checklist. */
export const CpaPrepScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const exams = useCpa((s) => s.exams);
  const ready = CORE_CPA_CODES.every((c) => exams[c]);
  useEffect(() => { stampExamScope(); }, []); // older questions get their exam code (additive, nothing moves)
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Professional exam prep" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Your FAR, AUD and REG textbooks, question banks and practice never mix: every exam keeps its own questions and scores, with no project needed. Each has a checklist of topics that shows whether you actually understand them, from how you answer questions, not just from ticking a box.</Text>
        {!ready && <Button title="Set up FAR, AUD and REG" onPress={() => { setupAllCpaExams(); }} testID="cpa-setup" />}
        {CPA_EXAMS.map((e) => <ExamCard key={e.code} code={e.code} onOpen={() => navigation.navigate('CpaExam', { code: e.code })} />)}
        <Text style={[styles.title, { color: colors.text }]}>More exams and tests</Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Every one works the same way: tap it and it gets a checklist of topics, practice questions and a board.</Text>
        {EXAM_FIELDS.map((field) => (
          <Fold key={field} title={`${field} (${OTHER_EXAMS.filter((e) => e.field === field).map((e) => e.short).join(', ')})`} testID={`exam-field-${field}`}>
            {OTHER_EXAMS.filter((e) => e.field === field).map((e) => <ExamCard key={e.code} code={e.code} onOpen={() => { setupCpaExam(e.code); navigation.navigate('CpaExam', { code: e.code }); }} />)}
          </Fold>
        ))}
        <Text style={[styles.note, { color: colors.textMuted }]}>The topic lists are starting outlines written from general knowledge, not the official blueprints. Compare them with the current blueprint for your exam date and edit them on each exam's page.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const ExamCard: React.FC<{ code: ExamCode; onOpen: () => void }> = ({ code, onOpen }) => {
  const { colors } = useTheme();
  const status = useExamStatus(code);
  const info = examInfo(code);
  return (
    <TouchableOpacity onPress={onOpen} testID={`cpa-card-${code}`} accessibilityRole="button">
      <Card style={styles.card}>
        <Text style={[styles.title, { color: colors.text }]}>{info.group === 'cpa' ? `${info.code}: ` : ''}{info.name}</Text>
        <Text style={{ color: colors.textSecondary }}>
          {status.exam ? `${status.board ? `Board ${courseProgress(status.board).done} of ${courseProgress(status.board).total} · ` : ''}${status.understood} of ${status.rows.length} topics understood · ${status.covered} ticked · ${status.questions} practice questions` : info.group === 'cpa' ? 'Not set up yet' : 'Tap to set up'}
        </Text>
      </Card>
    </TouchableOpacity>
  );
};

const TopicRow: React.FC<{ topic: CpaTopic; ticked: boolean; label: string; onTick: () => void; onCheck: () => void; onRemove: () => void }> = ({ topic, ticked, label, onTick, onCheck, onRemove }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.topic} testID={`cpa-topic-${topic.id}`}>
      <TouchableOpacity onPress={onTick} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={`I have covered ${topic.name}`} testID={`cpa-tick-${topic.id}`} hitSlop={8}>
        <Icon name={ticked ? 'check-square' : 'square'} size={20} color={ticked ? colors.primary : colors.textMuted} />
      </TouchableOpacity>
      <View style={styles.grow}>
        <Text style={{ color: colors.text }}>{topic.name}</Text>
        <Text style={[styles.small, { color: colors.textSecondary }]} testID={`cpa-status-${topic.id}`}>{label}</Text>
      </View>
      <TouchableOpacity onPress={onCheck} style={[styles.check, { borderColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={`Check my understanding of ${topic.name}`} testID={`cpa-check-${topic.id}`}>
        <Text style={{ color: colors.primary }}>Check</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} accessibilityLabel={`Remove ${topic.name}`} hitSlop={8}><Icon name="x" size={16} color={colors.textMuted} /></TouchableOpacity>
    </View>
  );
};

/** One exam: add its documents and question banks, practice, and work down the checklist. */
export const CpaExamScreen: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { code } = useRoute<any>().params as { code: ExamCode };
  const info = examInfo(code);
  const status = useExamStatus(code);
  const toggle = useCpa((s) => s.toggleCovered);
  const addTopic = useCpa((s) => s.addTopic);
  const removeTopic = useCpa((s) => s.removeTopic);
  const replaceOutline = useCpa((s) => s.replaceOutline);
  const setExamDate = useCpa((s) => s.setExamDate);
  const [dateText, setDateText] = useState('');
  const [docs, setDocs] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [outline, setOutline] = useState('');
  const [editing, setEditing] = useState(false);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const projectId = status.exam?.projectId;
  const groupProject = useCpa((s) => s.groupProjectId);
  useEffect(() => { if (projectId) Promise.resolve(ragService.getDocumentsByProject(projectId)).then((d: unknown[]) => setDocs(d.length)).catch(() => setDocs(null)); }, [projectId, message]);
  if (!status.exam) return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}><ScreenHeader title={examLabel(code)} /><Text style={[styles.note, styles.body, { color: colors.textSecondary }]}>Set up the exams first, from CPA exam prep.</Text></SafeAreaView>
  );
  const topics = status.exam.topics.map((t) => t.name);
  const areas = [...new Set(status.exam.topics.map((t) => t.area))];

  const addDocs = async (fn: () => Promise<any>) => {
    try { const r = await fn(); if (r) setMessage(summarize(r.result ?? r)); } catch (e: any) { Alert.alert('Could not add those', String(e?.message || e)); }
  };
  const evidenceOf = (id: string) => status.rows.find((r) => r.topic.id === id)!.evidence;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title={examLabel(code)} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>{info.name}</Text>
        <Text style={{ color: colors.textSecondary }} testID="cpa-summary">{status.understood} of {status.rows.length} topics understood · {status.covered} ticked · {status.questions} practice questions</Text>

        <Card style={styles.card} testID="cpa-date">
          <Text style={[styles.title, { color: colors.text }]}>Exam date</Text>
          {status.exam.examDate ? <Text style={{ color: colors.text }} testID="cpa-pace">{describePace(pace(status.exam.examDate, status.rows.length - status.understood)!)}</Text> : <Text style={[styles.small, { color: colors.textSecondary }]}>Add your exam date to see how many topics a week it takes.</Text>}
          <View style={styles.row}>
            <TextInput value={dateText} onChangeText={setDateText} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="cpa-date-input" autoCapitalize="none" />
            <Button title="Set" variant="outline" disabled={!validDay(dateText.trim())} onPress={() => { setExamDate(code, validDay(dateText.trim())); setDateText(''); }} testID="cpa-date-set" />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.title, { color: colors.text }]}>Your materials</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>{!projectId ? 'Practice and the checklist work without a project. To keep textbooks and notes together for the tutor, organize your CPA study in one project (optional).' : docs === null ? 'Textbooks, notes, projects and study guides for this exam.' : `${docs} document${docs === 1 ? '' : 's'} in this project. The tutor answers from them.`}</Text>
          <View style={styles.row}>
            {projectId ? (<>
              <Button title="Add files" variant="outline" onPress={() => addDocs(() => pickAndAddFiles(projectId, setMessage))} testID="cpa-add-files" />
              <Button title="Add a folder" variant="outline" onPress={() => addDocs(() => pickAndAddFolder(projectId, setMessage))} testID="cpa-add-folder" />
              <Button title="Open the project" variant="ghost" onPress={() => navigation.navigate('ProjectDetail', { projectId })} />
            </>) : (
              <Button title="Organize CPA study in one project" variant="outline" testID="cpa-organize"
                onPress={() => Alert.alert('Organize CPA study in one project?', 'This makes ONE project called "CPA Exam Preparation" for all your CPA exams. Each exam still keeps its own questions and scores. Nothing is moved or deleted.', [{ text: 'Cancel' }, { text: 'Create it', onPress: () => organizeCpaInOneProject(groupProject) }])} />
            )}
          </View>
          {!!message && <Text style={[styles.small, { color: colors.textSecondary }]}>{message}</Text>}
        </Card>

        <Card style={styles.card} testID="cpa-board">
          <Text style={[styles.title, { color: colors.text }]}>Learn it on a board</Text>
          <Text style={[styles.small, { color: colors.textSecondary }]}>
            {status.board ? `${courseProgress(status.board).done} of ${courseProgress(status.board).total} squares played. ` : ''}A board game for {code} like the other courses: a lesson square for each topic, written from the files you added above, and a quiz after each area. Playing a topic's square ticks it on the checklist.
          </Text>
          <View style={styles.row}>
            <Button title={status.board ? `Open the ${code} board` : `Start the ${code} board`} onPress={() => { const id = ensureExamCourse(code); if (id) navigation.navigate('TopicBoard', { courseId: id }); }} testID="cpa-board-open" />
            {!!status.board && <Button title="Rebuild from the checklist" variant="outline" testID="cpa-board-rebuild"
              onPress={() => Alert.alert('Rebuild the board?', 'The board is made again from the checklist. Squares you already played start over.', [{ text: 'Cancel' }, { text: 'Rebuild', onPress: () => { const id = ensureExamCourse(code, true); if (id) navigation.navigate('TopicBoard', { courseId: id }); } }])} />}
          </View>
        </Card>

        <QuestionImport topics={topics} onAdded={() => setMessage('')} onConfirm={(items) => {
          const r = addToPractice(items, { projectId, examCode: code }, topics);
          return `${r.added} questions added to ${code} practice${r.repeats ? `, ${r.repeats} skipped because they were already there` : ''}.`;
        }} />

        <View style={styles.row}>
          <Button title="Practice questions" onPress={() => navigation.navigate('Practice', { projectId, examCode: code })} testID="cpa-practice" />
          {!!projectId && <Button title="Chat with the tutor" variant="outline" onPress={() => navigation.navigate('ProjectDetail', { projectId })} />}
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Checklist</Text>
        <Text style={[styles.small, { color: colors.textSecondary }]}>Tick a topic when you have studied it. Check tests whether you really understand it: it asks questions from your own materials. A topic shows as understood after at least 5 different questions with 80% right.</Text>
        {areas.map((area) => {
          const inArea = status.exam!.topics.filter((t) => t.area === area);
          const done = inArea.filter((t) => evidenceOf(t.id).status === 'understood').length;
          return (
            <View key={area} testID={`cpa-area-${area}`}>
              <Text style={[styles.area, { color: colors.text }]}>{area} ({done} of {inArea.length})</Text>
              {inArea.map((t) => (
                <TopicRow key={t.id} topic={t} ticked={t.covered || boardCovers(status.board, t.name)} label={describeEvidence(evidenceOf(t.id))} onTick={() => toggle(code, t.id)}
                  onCheck={() => navigation.navigate('Practice', { projectId, examCode: code, topic: t.name })} onRemove={() => removeTopic(code, t.id)} />
              ))}
            </View>
          );
        })}
        <View style={styles.row}>
          <TextInput value={newTopic} onChangeText={setNewTopic} placeholder="Add a topic" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="cpa-new-topic" />
          <Button title="Add" variant="outline" onPress={() => { addTopic(code, areas[areas.length - 1] ?? 'Topics', newTopic); setNewTopic(''); }} disabled={!newTopic.trim()} testID="cpa-add-topic" />
        </View>
        <TouchableOpacity onPress={() => setEditing((v) => !v)} accessibilityRole="button" testID="cpa-edit-outline"><Text style={{ color: colors.primary }}>{editing ? 'Hide outline editor' : 'Replace the outline with the official blueprint'}</Text></TouchableOpacity>
        {editing && (
          <View>
            <Text style={[styles.small, { color: colors.textSecondary }]}>Paste the exam's current official content outline and topics. A line ending in a colon starts an area; each line after it is a topic. Topics you ticked that keep their name stay ticked.</Text>
            <TextInput value={outline} onChangeText={setOutline} multiline placeholder={'Area I: Taxes:\nBasis\nCapital gains\nArea II: Entities:\nS corporations'} placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.tall, { color: colors.text, borderColor: colors.border }]} testID="cpa-outline-text" />
            <Button title={outlineBusy ? 'Reading the file...' : 'Read an outline from a file (PDF or text)'} variant="outline" disabled={outlineBusy} testID="cpa-outline-file"
              onPress={async () => {
                setOutlineBusy(true);
                try {
                  const { pick, types } = require('@react-native-documents/picker');
                  const [file] = await pick({ type: [types.allFiles], mode: 'import', allowMultiSelection: false });
                  if (!file) return;
                  const text: string = await require('../services/documentService').documentService.textFromPicked(file.uri, file.name ?? 'outline.txt', 200000);
                  const areasFound = await outlineFromText(text, (s, u) => require('../study/engine').askModel(s, u));
                  if (!areasFound.length) { Alert.alert('No topics found', 'Could not find areas and topics in that file.'); return; }
                  setOutline(outlineToText(areasFound)); // shown for you to check before it is used
                } catch (e: any) { if (!/cancel/i.test(String(e?.message || e))) Alert.alert('Could not read that file', String(e?.message || e)); }
                finally { setOutlineBusy(false); }
              }} />
            <Button title="Use this outline" onPress={() => { const areasIn = parseOutline(outline); if (!areasIn.length) { Alert.alert('No topics found', 'Write each area on a line ending with a colon, then its topics underneath.'); return; } replaceOutline(code, areasIn); setEditing(false); setOutline(''); }} testID="cpa-outline-apply" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80, gap: SPACING.md },
  note: { ...TYPOGRAPHY.bodySmall },
  title: { ...TYPOGRAPHY.h3 },
  area: { ...TYPOGRAPHY.h3, marginTop: SPACING.md, marginBottom: SPACING.xs },
  card: { marginBottom: SPACING.xs },
  small: { ...TYPOGRAPHY.bodySmall },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  grow: { flex: 1 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  check: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  tall: { minHeight: 140, textAlignVertical: 'top' },
});
