import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../components/Button';
import { Fold } from '../components/Fold';
import { friendlyTitle } from './chapters';
import { FORMATS, type SquareFormat } from './formats';
import { useTopics, type Course } from './store';

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
    </>
  );
}

/** Add a game or any other kind of square after the one the learner is on, in the same chapter. */
export function AddSquarePanel({ course, currentKey }: { course: Course; currentKey: string | undefined }) {
  const { colors } = useTheme();
  const here = course.squares.find((q) => q.key === currentKey);
  return (
    <Fold title="Add a game or activity to the board" testID="course-add-square">
      <Text style={[styles.meta, { color: colors.textSecondary }]}>It goes after the square you are on, in the same chapter, and is written when you reach it.</Text>
      <View style={styles.chips}>
        {ADDABLE.map((f) => {
          const info = FORMATS.find((x) => x.id === f)!;
          return <Chip key={f} label={info.label} on={false} testID={`course-add-${f}`}
            onPress={() => { if (here) useTopics.getState().addSquare(course.id, here.key, { format: f, title: `${info.label}: ${friendlyTitle(here.unit)}`, focus: `${info.label} on ${here.topic || friendlyTitle(here.unit)}` }); }} />;
        })}
      </View>
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

const styles = StyleSheet.create({
  meta: { fontSize: 13 },
  gap: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
