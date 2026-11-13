import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useAppStore, useChatStore, useProjectStore } from '../stores';
import { Button } from '../components/Button';
import { ForceLoadModel } from '../components/ForceLoadModel';
import { Board } from '../language/Board';
import type { Space, SpaceKind } from '../language/board';
import { FORMATS, type SquareContent, type SquareFormat } from './formats';
import { courseProgress, useTopics, type Course } from './store';
import { createCourse, findSources, squareContent } from './service';
import { importCourseFile, shareCourseFile } from './courseFiles';
import { MAX_SOURCES, makeSource, outlineSources, type CourseSource } from './sources';
import { addFilesToProject, pickAndAddFiles, pickFiles, projectForSubject, summarize, type PickedFile } from '../learning/documents';
import { ProjectChips } from '../components/ProjectChips';
import { SquareView } from './SquareViews';
import { ExamMatchCard } from './ExamMatchCard';
import { keepMissed } from './review';
import { useOffGrid } from '../atlasTools/offGrid';
import { UndoRow, useUndo } from '../components/UndoRow';

/** The board's colored band is chosen by a square's kind; each format borrows one so formats read apart at a glance. */
const BOARD_KIND: Record<SquareFormat, SpaceKind> = {
  lesson: 'lesson', quiz: 'speed', cards: 'story', match: 'wordsearch', order: 'podcast', practice: 'call',
  fill: 'speed', truefalse: 'speed', scenario: 'call', numeric: 'crossword', worked: 'lesson', table: 'review',
  recall: 'story', fix: 'wordsearch', tablefill: 'crossword', sort: 'podcast', dictation: 'story', reading: 'review', predict: 'speed', drill: 'crossword', periodic: 'wordsearch',
};
const iconOf = (format: SquareFormat) => FORMATS.find((f) => f.id === format)?.icon ?? 'circle';

const LEVELS = ['Complete beginner', 'Know a little', 'Intermediate', 'Advanced'];
const SITTINGS = [5, 10, 15, 20];

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, on ? { borderColor: colors.primary, backgroundColor: colors.surface } : { borderColor: colors.border }]}>
      <Text style={{ color: on ? colors.primary : colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} accessibilityLabel="Back"><Icon name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
    </View>
  );
}

/** Your courses, and a form to make a new one on any subject. */
export const TopicsScreen: React.FC = () => {
  const undo = useUndo();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const given = (useRoute<any>().params ?? {}) as { projectId?: string; topic?: string };
  const all = useTopics((s) => s.courses);
  const remove = useTopics((s) => s.remove);
  const projectName = useProjectStore((s) => s.projects.find((p) => p.id === given.projectId)?.name);
  const courses = given.projectId ? all.filter((c) => c.projectId === given.projectId) : all;
  const [form, setForm] = useState(false);
  const [topic, setTopic] = useState(given.topic ?? '');
  const [goal, setGoal] = useState('');
  const [how, setHow] = useState('');
  const [level, setLevel] = useState(LEVELS[0]);
  const [minutes, setMinutes] = useState(10);
  const [online, setOnline] = useState(false);
  const offGrid = useOffGrid((st) => st.on);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [step, setStep] = useState('Designing your board...');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true); setError(null); setStep('Designing your board...');
    try {
      let sources = online ? await findSources(topic.trim(), goal.trim(), setStep) : [];
      let projectId = given.projectId;
      if (files.length) {
        // Files go into the course's project, so they are searched for each square (a whole textbook is fine). Without a project, one is made for this subject.
        projectId = projectId ?? projectForSubject(topic.trim());
        const result = await addFilesToProject({ projectId, files, onProgress: setStep });
        sources = [...sources, ...(await outlineSources(files.filter((f) => result.added.includes(f.name))))].slice(0, MAX_SOURCES);
        if (result.failed.length) Alert.alert('Some files could not be added', result.failed.map((f) => `${f.name}: ${f.reason}`).join('\n'));
      }
      setStep('Designing your board...');
      const id = await createCourse({ topic: topic.trim(), goal: goal.trim(), level, how: how.trim(), minutes }, sources, projectId);
      setForm(false); setTopic(''); setGoal(''); setHow(''); setFiles([]);
      navigation.navigate('TopicBoard', { courseId: id });
    } catch (e: any) { setError(String(e?.message || e)); }
    setBusy(false);
  };
  const chooseFiles = async () => {
    try {
      const picked = await pickFiles();
      if (picked) setFiles((current) => [...current, ...picked.filter((p) => !current.some((a) => a.name === p.name))]);
    } catch (e: any) { setError(String(e?.message || e)); }
  };
  const openFile = async () => {
    try {
      const id = await importCourseFile(given.projectId);
      if (id) navigation.navigate('TopicBoard', { courseId: id });
    } catch (e: any) { Alert.alert('Could not open that course', String(e?.message || e)); }
  };
  const confirmDelete = (c: Course) => undo.remove(c.title, () => remove(c.id), () => useTopics.setState((s) => ({ courses: [c, ...s.courses].slice(0, 20) })));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={projectName ? `Courses in ${projectName}` : 'Learn a topic'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {projectName ? `A course in this project: the project's shared documents are used as material, and the tutor chats live in the project. ` : ''}Name anything: accounting, Python, the French Revolution, guitar chords. The AI on your phone designs a board for it, choosing lessons, quizzes, flashcards, matching, ordering and practice problems to suit the subject and how you like to learn, and writes each square when you reach it.
        </Text>
        <UndoRow pending={undo.pending} undo={undo.undo} />
        {courses.map((c) => {
          const p = courseProgress(c);
          return (
            <TouchableOpacity key={c.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('TopicBoard', { courseId: c.id })} onLongPress={() => confirmDelete(c)} testID={`course-${c.id}`}>
              <Text style={[styles.name, { color: colors.text }]}>{c.title}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{c.summary || c.topic}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{p.done} of {p.total} squares · hold to delete</Text>
            </TouchableOpacity>
          );
        })}
        {!courses.length && !form && <Text style={[styles.meta, { color: colors.textMuted }]} testID="topics-empty">No courses yet.</Text>}

        {!form && <Button title="New course" onPress={() => setForm(true)} testID="course-new" />}
        {!form && <Button title="Open a course someone sent" variant="outline" onPress={openFile} testID="course-import" />}
        {form && (
          <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.surface }]} testID="course-form">
            <TextInput value={topic} onChangeText={setTopic} placeholder="What do you want to learn?" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="course-topic" />
            <TextInput value={goal} onChangeText={setGoal} multiline placeholder="What do you want to be able to do? (optional)" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="course-goal" />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Where are you now?</Text>
            <View style={styles.chips}>{LEVELS.map((l) => <Chip key={l} label={l} on={level === l} onPress={() => setLevel(l)} testID={`course-level-${l.split(' ')[0].toLowerCase()}`} />)}</View>
            <TextInput value={how} onChangeText={setHow} multiline placeholder="How do you like to learn? (optional) e.g. lots of practice problems, short lessons, real examples"
              placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="course-how" />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Minutes per square</Text>
            <View style={styles.chips}>{SITTINGS.map((m) => <Chip key={m} label={`${m}`} on={minutes === m} onPress={() => setMinutes(m)} testID={`course-minutes-${m}`} />)}</View>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Your own material (textbooks, notes, question banks): the course is built from it, and each square is written from the parts that cover it.</Text>
            {files.map((f) => (
              <View key={f.name} style={styles.row}>
                <Icon name="file-text" size={14} color={colors.textMuted} />
                <Text style={[styles.meta, styles.grow, { color: colors.textSecondary }]} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity onPress={() => setFiles((current) => current.filter((x) => x.name !== f.name))} testID={`course-file-remove-${f.name}`} accessibilityLabel={`Remove ${f.name}`}><Icon name="x" size={16} color={colors.textMuted} /></TouchableOpacity>
              </View>
            ))}
            <Chip label="Add files" on={false} onPress={chooseFiles} testID="course-add-files" />
            <TouchableOpacity style={styles.row} onPress={() => setOnline(!online)} testID="course-online" accessibilityRole="switch" accessibilityState={{ checked: online }}>
              <Icon name={online ? 'check-square' : 'square'} size={18} color={online ? colors.primary : colors.textMuted} />
              <Text style={[styles.meta, styles.grow, { color: colors.textSecondary }]}>Look for good sources online first and build the course from them (uses the internet){offGrid ? '. Off-grid mode is on, so this will not work until you turn it off.' : ''}</Text>
            </TouchableOpacity>
            {busy && <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={[styles.meta, { color: colors.textSecondary }]} testID="course-step">{step}</Text></View>}
            {!!error && <Text style={{ color: colors.error }} testID="course-error">{error}</Text>}
            <ForceLoadModel testID="course-force-load" />
            <View style={styles.row}>
              <Button title="Make my course" onPress={make} disabled={!topic.trim() || busy} testID="course-make" />
              <Button title="Cancel" variant="ghost" onPress={() => setForm(false)} disabled={busy} testID="course-cancel" />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};


/** The material a course is written from: pages the AI found online, pasted notes, text files. */
function SourcesCard({ course }: { course: Course }) {
  const { colors } = useTheme();
  const sources = course.sources ?? [];
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noting, setNoting] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const add = (list: CourseSource[]) => useTopics.getState().addSources(course.id, list);

  const find = async () => {
    setBusy(true); setError(null);
    try { add(await findSources(course.topic, course.request.goal, setStep)); } catch (e: any) { setError(String(e?.message || e)); }
    setBusy(false);
  };
  const addToProject = async () => {
    setError(null);
    try {
      // A course with no project gets one named after its subject, so the files have somewhere to live.
      const projectId = course.projectId ?? projectForSubject(course.topic);
      if (!course.projectId) useTopics.getState().setProject(course.id, projectId);
      const result = await pickAndAddFiles(projectId, setStep);
      if (result) Alert.alert('Documents', summarize(result));
    } catch (e: any) { setError(String(e?.message || e)); }
  };
  const saveNote = () => {
    add([makeSource({ title: noteTitle || 'My notes', kind: 'note', text: noteText }, `note-${Date.now()}`)]);
    setNoting(false); setNoteTitle(''); setNoteText('');
  };
  const pickFile = async () => {
    setError(null);
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const { documentService } = require('../services/documentService');
      const picked: Array<{ uri: string; name?: string }> = (await pick({ mode: 'open', type: [types.allFiles], allowMultiSelection: true })) ?? [];
      const found: CourseSource[] = [];
      const unreadable: string[] = [];
      for (const [i, file] of picked.entries()) {
        // Any readable document (PDF, Word, text...), not only plain text. The first part of each is kept as a source.
        const text: string = await documentService.textFromPicked(file.uri, file.name || 'notes.txt', 12000).catch(() => '');
        if (text.trim().length < 50) { unreadable.push(file.name || 'a file'); continue; }
        found.push(makeSource({ title: file.name || 'File', kind: 'file', text }, `file-${Date.now()}-${i}`));
      }
      if (found.length) add(found);
      if (unreadable.length) setError(`Could not read any text in: ${unreadable.join(', ')}.`);
    } catch (e: any) { if (e?.code !== 'OPERATION_CANCELED') setError(String(e?.message || e)); }
  };
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="course-sources">
      <Text style={[styles.name, { color: colors.text }]}>Sources ({sources.length})</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Squares are written from these where they cover the point. Squares already written stay as they are.</Text>
      {sources.map((x) => (
        <View key={x.id} style={styles.row}>
          <Icon name={x.kind === 'web' ? 'globe' : x.kind === 'file' ? 'file-text' : 'edit-3'} size={14} color={colors.textMuted} />
          <Text style={[styles.meta, styles.grow, { color: colors.textSecondary }]} numberOfLines={1}>{x.title}</Text>
          <TouchableOpacity onPress={() => useTopics.getState().removeSource(course.id, x.id)} testID={`source-remove-${x.id}`} accessibilityLabel={`Remove ${x.title}`}><Icon name="x" size={16} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
      {busy && <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={[styles.meta, { color: colors.textSecondary }]}>{step}</Text></View>}
      {!!error && <Text style={{ color: colors.error }} testID="sources-error">{error}</Text>}
      <Text style={[styles.meta, { color: colors.textMuted }]}>Project folder: its documents (a whole textbook is fine) are searched for each square you open.</Text>
      <ProjectChips value={course.projectId ?? ''} onChange={(id) => useTopics.getState().setProject(course.id, id || undefined)} colors={colors} testID="course-project" />
      <Chip label="Add files to the project" on={false} onPress={addToProject} testID="course-project-files" />
      {noting ? (
        <View style={styles.gap}>
          <TextInput value={noteTitle} onChangeText={setNoteTitle} placeholder="Title" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="note-title" />
          <TextInput value={noteText} onChangeText={setNoteText} multiline placeholder="Paste your notes or text" placeholderTextColor={colors.textMuted} style={[styles.input, styles.tall, { color: colors.text, borderColor: colors.border }]} testID="note-text" />
          <View style={styles.row}>
            <Button title="Add" onPress={saveNote} disabled={noteText.trim().length < 20} testID="note-save" />
            <Button title="Cancel" variant="ghost" onPress={() => setNoting(false)} />
          </View>
        </View>
      ) : (
        <View style={styles.chips}>
          <Chip label="Find sources online" on={false} onPress={find} testID="sources-find" />
          <Chip label="Paste notes" on={false} onPress={() => setNoting(true)} testID="sources-note" />
          <Chip label="Add files" on={false} onPress={pickFile} testID="sources-file" />
        </View>
      )}
    </View>
  );
}

/** One course drawn as a board game. */
export const TopicBoardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { courseId } = useRoute<any>().params as { courseId: string };
  const course = useTopics((s) => s.courses.find((c) => c.id === courseId));
  if (!course) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}><Header title="Course" onBack={() => navigation.goBack()} /></SafeAreaView>;

  const done = (key: string) => !!course.progress[key];
  const spaces: Space[] = course.squares.map((s) => ({ key: s.key, kind: s.checkpoint ? 'checkpoint' : BOARD_KIND[s.format], title: s.title, icon: iconOf(s.format) }));
  const current = Math.max(0, spaces.findIndex((s) => !done(s.key)));
  const open = (i: number) => i === 0 || done(spaces[i - 1].key) || done(spaces[i].key);
  const p = courseProgress(course);
  const stars = Object.values(course.progress).reduce((n, x) => n + x.stars, 0);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={course.theme || course.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.name, { color: colors.text }]}>{course.title}</Text>
        {!!course.summary && <Text style={[styles.meta, { color: colors.textSecondary }]}>{course.summary}</Text>}
        {!!course.style && <Text style={[styles.meta, { color: colors.textMuted }]} testID="course-style">How it teaches: {course.style}</Text>}
        <Text style={[styles.meta, { color: colors.textMuted }]} testID="course-progress">{p.done} of {p.total} squares · {stars} stars</Text>
        <SourcesCard course={course} />
        <ExamMatchCard course={course} />
        <Button title="Send this course to another phone" variant="outline" testID="course-share"
          onPress={() => shareCourseFile(course).catch((e) => Alert.alert('Could not save the course', String(e?.message || e)))} />
        <Board spaces={spaces} isDone={done} isOpen={open} current={current}
          onPress={(s) => navigation.navigate('TopicSquare', { courseId, key: s.key })} />
      </ScrollView>
    </SafeAreaView>
  );
};

/** The passages of the learner's own books a square was written from, folded away until asked for. */
function CitedFold({ passages }: { passages: { source: string; text: string }[] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (!passages.length) return null;
  return (
    <View testID="square-cited">
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" testID="square-cited-toggle">
        <Text style={{ color: colors.primary }}>{open ? 'Hide' : 'Show'} where this came from ({passages.length} passage{passages.length === 1 ? '' : 's'} from your sources)</Text>
      </TouchableOpacity>
      {open && passages.map((p, i) => (
        <View key={i} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{p.source}</Text>
          <Text style={{ color: colors.textSecondary }}>{p.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** One square: written when first opened, then played. */
export const TopicSquareScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { courseId, key } = useRoute<any>().params as { courseId: string; key: string };
  const course = useTopics((s) => s.courses.find((c) => c.id === courseId));
  const square = course?.squares.find((s) => s.key === key);
  const [content, setContent] = useState<SquareContent | null>(course?.content[key] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [addedRemedial, setAddedRemedial] = useState(false);

  const load = React.useCallback(() => {
    if (!course) return;
    setError(null);
    squareContent(course, key).then(setContent).catch((e) => setError(String(e?.message || e)));
  }, [course, key]);
  React.useEffect(() => { if (!content) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course || !square) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}><Header title="Square" onBack={() => navigation.goBack()} /></SafeAreaView>;
  // A square that went badly gets a lesson right after it that explains the same thing another way.
  const finish = (n: 1 | 2 | 3, missed: number[] = []) => {
    useTopics.getState().complete(courseId, key, n);
    if (content && missed.length) keepMissed({ course, square, content, missed });
    if (n === 1 && square.format !== 'lesson') setAddedRemedial(useTopics.getState().addRemedial(courseId, key));
    setStars(n);
  };
  const again = () => { useTopics.getState().clearContent(courseId, key); setContent(null); setStars(null); setAddedRemedial(false); load(); };
  const askTutor = () => {
    const app = useAppStore.getState();
    const modelId = app.activeModelId ?? app.downloadedModels[0]?.id;
    if (!modelId) { Alert.alert('No model', 'Download or pick a text model first.'); return; }
    const chat = useChatStore.getState();
    const id = chat.createConversation(modelId, `${course.title}: ${square.title}`, course.projectId);
    navigation.navigate('Chat', {
      conversationId: id, ...(course.projectId ? { projectId: course.projectId } : {}),
      starter: `I'm working through the course "${course.title}" (${course.topic}), on the square "${square.title}": ${square.focus}. `,
    });
  };
  const index = course.squares.findIndex((s) => s.key === key);
  const next = useTopics.getState().courses.find((c) => c.id === courseId)?.squares[index + 1] ?? course.squares[index + 1];
  const results = course.squares.slice(Math.max(0, index - 2), index).map((q) => course.progress[q.key]?.stars ?? 0);
  const cruising = square.format === 'lesson' && results.length === 2 && results.every((n) => n === 3);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={square.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.meta, { color: colors.textMuted }]}>{FORMATS.find((f) => f.id === square.format)?.label} · {square.unit}</Text>
        {stars !== null ? (
          <View style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.surface }]} testID="square-finished">
            <Text style={[styles.name, { color: colors.text }]}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{next ? `Next: ${next.title}` : 'You finished the course.'}</Text>
            {addedRemedial && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="square-remedial">That was a hard one, so a lesson that explains it another way comes next.</Text>}
            {square.format !== 'lesson' && <Button title="Try new questions" variant="ghost" onPress={again} testID="square-again" />}
            {next && <Button title="Next square" onPress={() => navigation.replace('TopicSquare', { courseId, key: next.key })} testID="square-next" />}
            <Button title="Back to the board" variant="outline" onPress={() => navigation.goBack()} testID="square-board" />
          </View>
        ) : content ? (
          <>
            <TouchableOpacity onPress={askTutor} testID="square-tutor" accessibilityLabel="Ask the tutor about this square">
              <Text style={{ color: colors.primary }}>Ask the tutor about this</Text>
            </TouchableOpacity>
            {square.format === 'lesson' && (
              <TouchableOpacity onPress={() => finish(2)} testID="square-skip" accessibilityLabel="I already know this">
                <Text style={{ color: colors.primary }}>{cruising ? 'You got the last two right. Skip this lesson?' : 'I already know this'}</Text>
              </TouchableOpacity>
            )}
            <SquareView content={content} onDone={finish} />
            <CitedFold passages={course.cited?.[key] ?? []} />
          </>
        ) : error ? (
          <View style={styles.gap}>
            <Text style={{ color: colors.error }} testID="square-error">{error}</Text>
            <ForceLoadModel testID="square-force-load" />
            <Button title="Try again" onPress={load} testID="square-retry" />
          </View>
        ) : (
          <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={[styles.meta, { color: colors.textSecondary }]} testID="square-writing">Writing this square...</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  title: { fontSize: 22, fontWeight: '400', flex: 1 },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  meta: { fontSize: 13 },
  name: { fontSize: 18, fontWeight: '400' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gap: { gap: 10 },
  grow: { flex: 1 },
  tall: { minHeight: 100 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
