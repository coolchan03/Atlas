import { SPACING } from '../constants';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../components/Button';
import { Fold } from '../components/Fold';
import { Select } from '../components/Select';
import { unitsOf } from './prepare';
import { bookLabel, friendlyTitle } from './chapters';
import { FORMATS, type SquareFormat } from './formats';
import { useTopics, type Course } from './store';
import { phaseOf, subscribe } from './generationQueue';
import { stopWriting } from './service';
import { editBoard } from './boardEdit';
import { coverageView, STATE_LABEL } from './coverageView';
import { useCpa } from '../cpa/store';

/** The kinds of square a learner can add to the board themselves (the ones the app makes in code are left out). */
const ADDABLE: SquareFormat[] = ['crossword', 'wordsearch', 'scramble', 'memory', 'hangman', 'match', 'quiz', 'truefalse', 'fill', 'recall', 'sort', 'order', 'cards', 'scenario', 'practice', 'numeric'];

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.surface : undefined }]}>
      <Text style={{ color: on ? colors.primary : colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** How long and detailed the readings are: in depth (full textbook paragraphs, the default) or short. */
export function ReadingDepthChips({ course }: { course: Course }) {
  const { colors } = useTheme();
  const set = (depth: 'standard' | 'deep') => useTopics.getState().setReadingDepth(course.id, depth);
  return (
    <>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>How detailed the readings are</Text>
      <View style={styles.chips} testID="course-depth">
        <Chip label="In depth" on={(course.readingDepth ?? 'deep') === 'deep'} onPress={() => set('deep')} testID="course-depth-deep" />
        <Chip label="Short" on={course.readingDepth === 'standard'} onPress={() => set('standard')} testID="course-depth-standard" />
      </View>
      <CoverageFold course={course} />
    </>
  );
}

/** What the course covers: the books and chapters it came from, how far each unit is taught, and (for an exam course) which exam objectives no book matches. */
export function CoverageFold({ course }: { course: Course }) {
  const { colors } = useTheme();
  const exam = useCpa((s) => Object.values(s.exams).find((e) => e?.courseId === course.id));
  const view = coverageView(course, (exam?.topics ?? []).map((t) => ({ id: t.id, name: t.name, area: t.area })));
  if (!course.bookChapters?.length && !view.objectives.length) return null;
  const line = (text: string, key: string, color = colors.textSecondary) => <Text key={key} style={[styles.meta, { color }]}>{text}</Text>;
  return (
    <Fold title="What this course covers" testID="course-coverage">
      {view.books.map((b) => line(`${b.doc}: ${b.chapters} chapters kept`, `b:${b.doc}`))}
      {view.units.map((u) => line(`${u.unit}: ${STATE_LABEL[u.state]} (${u.written} of ${u.total} written)`, `u:${u.unit}`))}
      {view.objectives.map((o, i) => line(o, `o:${i}`, o.endsWith('matches this') ? colors.error : colors.textSecondary))}
      {!!view.unmatched.length && line(`Chapters that match no exam objective (kept as their own units): ${view.unmatched.join('; ')}`, 'unmatched')}
      {view.caveats.map((c, i) => line(c, `c:${i}`, colors.textMuted))}
    </Fold>
  );
}

/** Tell the AI what is missing or should go ("add a quiz to chapter 3", "remove the word games") and it changes the board. */
export function ChangeBoardPanel({ course }: { course: Course }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const go = async () => {
    setBusy(true); setSaid('');
    try {
      const r = await editBoard(course.id, text);
      setSaid(!r ? 'The AI did not give a change Atlas could use. Try saying it another way.' : r.added || r.removed ? `Done: ${r.added} added, ${r.removed} removed. Squares you have played are never removed.` : 'The AI found nothing to change.');
      if (r) setText('');
    } catch (e) { setSaid(String((e as Error)?.message || e)); } finally { setBusy(false); }
  };
  return (
    <Fold title="Tell the AI what to change on the board" testID="course-change-board">
      <TextInput value={text} onChangeText={setText} multiline placeholder="For example: chapter 3 is missing a quiz, or remove the word games" placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]} testID="course-change-text" />
      <Button title={busy ? 'Changing the board...' : 'Change the board'} onPress={() => void go()} disabled={busy || !text.trim()} testID="course-change-go" />
      {!!said && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="course-change-done">{said}</Text>}
    </Fold>
  );
}

/** Which textbook the board teaches from: one book, or the books in the order they are taught (one at a time). */
export function SourceLine({ course }: { course: Course }) {
  const { colors } = useTheme();
  const docs = [...new Set(course.squares.map((q) => q.book).filter(Boolean) as string[])];
  const books = docs.length ? docs : [...new Set((course.bookChapters ?? []).map((c) => c.doc))];
  if (!books.length) return null;
  const names = books.map(bookLabel);
  return <Text style={[styles.meta, { color: colors.textSecondary }]} testID="course-source">{names.length === 1 ? `Primary source: ${names[0]}` : `Textbooks, taught one at a time: ${names.join(', then ')}`}</Text>;
}

/** Add a game or any other kind of square: after the one you are on, or at the end of any chapter or topic of the board. */
export function AddSquarePanel({ course, currentKey }: { course: Course; currentKey: string | undefined }) {
  const { colors } = useTheme();
  const [where, setWhere] = useState('here');
  const [added, setAdded] = useState('');
  const here = course.squares.find((q) => q.key === currentKey);
  const units = unitsOf(course);
  const target = where === 'here' ? here : [...course.squares].reverse().find((q) => q.unit === where && !q.checkpoint) ?? [...course.squares].reverse().find((q) => q.unit === where);
  const place = where === 'here' ? 'after the square you are on' : `at the end of ${friendlyTitle(where)}`;
  const add = (f: SquareFormat) => {
    const info = FORMATS.find((x) => x.id === f)!;
    if (!target) return;
    const key = useTopics.getState().addSquare(course.id, target.key, { format: f, title: `${info.label}: ${friendlyTitle(target.unit)}`, focus: `${info.label} on ${target.topic || friendlyTitle(target.unit)}` });
    setAdded(key ? `Added "${info.label}" ${place}. It is on the board now and is written when you reach it.` : 'The board is full, so nothing was added.');
  };
  return (
    <Fold title="Add a game or activity to the board" testID="course-add-square">
      <Select label="Where it goes" value={where} onChange={setWhere} testID="course-add-where"
        options={[{ id: 'here', label: 'After the square I am on' }, ...units.map((u) => ({ id: u.unit, label: `End of ${friendlyTitle(u.unit)}` }))]} />
      <View style={styles.chips}>
        {ADDABLE.map((f) => <Chip key={f} label={FORMATS.find((x) => x.id === f)!.label} on={false} testID={`course-add-${f}`} onPress={() => add(f)} />)}
      </View>
      {!!added && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="course-add-done">{added}</Text>}
    </Fold>
  );
}

/** Shown while a square is being written: it keeps going in the background, so there is no need to stay. */
export function WritingNotice({ embedded, onLeave }: { embedded: boolean; onLeave: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.gap}>
      <Text style={[styles.meta, { color: colors.textMuted }]} testID="square-writing-leave">This can take a minute. You do not have to wait here: it keeps writing in the background and is saved on the board when it is ready.</Text>
      {!embedded && <Button title="Back to the board" variant="outline" onPress={onLeave} testID="square-leave" />}
    </View>
  );
}

/**
 * Re-renders when the lesson queue changes, and says whether this square's deeper rewrite is still being written. When that rewrite is
 * finished and saved, the open lesson is switched to it (it would otherwise keep showing the short draft until the screen is reopened).
 */
export function useDeepening(o: { courseId: string; key: string; saved: unknown; content: unknown; adopt: (next: any) => void }): boolean {
  const { courseId, key, saved, content, adopt } = o;
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  const expanding = phaseOf(`${courseId}:${key}:deepen`) !== undefined;
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !expanding && saved && saved !== content) adopt(saved);
    was.current = expanding;
  }, [expanding, saved]); // eslint-disable-line react-hooks/exhaustive-deps -- only a change of these should switch the lesson
  return expanding;
}

/** A saved lesson that is ready to read while its in-depth version is still being written in the background. */
export function ExpandingNote({ show }: { show: boolean }) {
  const { colors } = useTheme();
  if (!show) return null;
  return <Text style={[styles.meta, { color: colors.textMuted }]} testID="square-expanding">Saved. Adding more depth in the background; this lesson is ready to read now.</Text>;
}

/** What the AI is doing for a square that is not written yet (waiting its turn, or writing), with a way to stop it. */
export function WritingStatus({ courseId, squareKey, onStopped }: { courseId: string; squareKey: string; onStopped: () => void }) {
  const { colors } = useTheme();
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  const waiting = phaseOf(`${courseId}:${squareKey}`) === 'waiting';
  return (
    <View style={styles.gap}>
      <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={[styles.meta, { color: colors.textSecondary }]} testID="square-writing">{waiting ? 'Waiting for the AI to finish another lesson...' : 'Writing this square...'}</Text></View>
      <Button title="Stop" variant="outline" onPress={() => { stopWriting(courseId, squareKey); onStopped(); }} testID="square-stop" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  meta: { fontSize: 13 },
  gap: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, minHeight: 64 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
