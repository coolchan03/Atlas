import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button, Card } from '../components';
import { ragService } from '../services/rag';
import { useExerciseStore } from '../study/exercises';
import { EXAMS, type ExamCode } from '../cpa/blueprints';
import { matchExam, summarize, type MatchRow } from './examMatch';
import { useTopics, type Course } from './store';

/**
 * "Does what my books teach match what the exam needs?" Pick an exam: every topic it asks for is checked against the books in this
 * course's project, the board's squares and your practice answers. No separate screen: this sits on the course the books made.
 */
export function ExamMatchCard({ course: shown }: { course: Course }) {
  const { colors } = useTheme();
  const [code, setCode] = useState<ExamCode | null>(null);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (next: ExamCode) => {
    // Always the board as it is now: lessons just added must count.
    const course = useTopics.getState().courses.find((c) => c.id === shown.id) ?? shown;
    setCode(next); setRows(null); setBusy(true);
    try {
      const { exercises, progress } = useExerciseStore.getState();
      const passages: string[] = [];
      for (const doc of course.projectId ? await ragService.getDocumentsByProject(course.projectId) : []) {
        for (const chunk of await ragService.getDocumentChunks(doc.id)) passages.push(String(chunk.content));
      }
      setRows(matchExam({ code: next, course, passages, exercises: Object.values(exercises), progress }));
    } finally { setBusy(false); }
  };
  const course = shown;
  const sum = rows ? summarize(rows) : null;
  const addToBoard = () => {
    if (!sum) return;
    useTopics.getState().addLessons(course.id, sum.toAdd.map((r) => ({ title: r.topic, focus: `${r.topic} (${r.area}), from your books`, unit: r.area })));
    if (code) void run(code);
  };
  return (
    <Card style={styles.card} testID="exam-match">
      <Text style={[styles.title, { color: colors.text }]}>Match to an exam</Text>
      <Text style={[styles.small, { color: colors.textSecondary }]}>
        {course.projectId ? 'Learn your books first, then check them against an exam: every topic the exam asks for is looked up in your books, on this board and in your practice answers.' : 'Connect this course to the project with your books (above) to check them against an exam.'}
      </Text>
      {!!course.projectId && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {EXAMS.map((e) => (
            <TouchableOpacity key={e.code} onPress={() => run(e.code)} testID={`exam-match-${e.code}`} accessibilityRole="button" accessibilityState={{ selected: code === e.code }}
              style={[styles.chip, { borderColor: code === e.code ? colors.primary : colors.border }]}>
              <Text style={{ color: code === e.code ? colors.primary : colors.textSecondary }}>{e.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {busy && <ActivityIndicator color={colors.primary} />}
      {sum && rows && (
        <View testID="exam-match-result">
          <Text style={{ color: colors.text }} testID="exam-match-summary">
            {sum.total - sum.gaps.length} of {sum.total} exam topics are in your books · {sum.played} played on the board · {sum.understood} understood
          </Text>
          {sum.gaps.length > 0 && <>
            <Text style={[styles.head, { color: colors.error }]}>Not in your books ({sum.gaps.length})</Text>
            <Text style={[styles.small, { color: colors.textSecondary }]}>The exam asks for these, but the books you added do not seem to cover them. Add a book or notes on them.</Text>
            {sum.gaps.map((r) => <Text key={r.topic} style={{ color: colors.text }}>• {r.topic}</Text>)}
          </>}
          {sum.toAdd.length > 0 && <>
            <Text style={[styles.head, { color: colors.text }]}>In your books, not on the board yet ({sum.toAdd.length})</Text>
            {sum.toAdd.map((r) => <Text key={r.topic} style={{ color: colors.textSecondary }}>• {r.topic}{r.inBooks === 'thin' ? ' (only a little in your books)' : ''}</Text>)}
            <Button title={`Add ${sum.toAdd.length} lesson${sum.toAdd.length === 1 ? '' : 's'} to the board`} onPress={addToBoard} testID="exam-match-add" />
          </>}
          {!sum.gaps.length && !sum.toAdd.length && <Text style={[styles.small, { color: colors.textSecondary }]}>Every topic the exam asks for is in your books and on this board.</Text>}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  head: { ...TYPOGRAPHY.h3, marginTop: SPACING.md },
  small: { ...TYPOGRAPHY.bodySmall, marginVertical: SPACING.xs },
  chips: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
});
