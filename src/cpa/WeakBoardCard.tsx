import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useExerciseStore } from '../study/exercises';
import { useTopics } from '../topics/store';
import { useCpa } from './store';
import { examLabel, type ExamCode } from './blueprints';
import { weakBoardPlan, weakTopics } from './weakBoard';

/** Builds a short board from the topics your practice shows you are weakest in. */
export function WeakBoardCard({ code }: { code: ExamCode }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const exam = useCpa((s) => s.exams[code]);
  const exercises = useExerciseStore((s) => s.exercises);
  const progress = useExerciseStore((s) => s.progress);
  const weak = weakTopics({ topics: exam?.topics ?? [], exercises: Object.values(exercises), progress, projectId: exam?.projectId, examCode: code });
  const build = () => {
    const id = useTopics.getState().add(
      { topic: `${examLabel(code)} review`, goal: `Pass the ${examLabel(code)} exam`, level: 'Preparing for the exam', how: 'Lessons then quizzes', minutes: 20 },
      weakBoardPlan(examLabel(code), weak), { projectId: exam?.projectId });
    navigation.navigate('TopicBoard', { courseId: id });
  };
  return (
    <Card style={styles.card} testID="cpa-weak-board">
      <Text style={[styles.title, { color: colors.text }]}>Review your weak spots</Text>
      {weak.length ? (
        <>
          <Text style={{ color: colors.textSecondary }}>{weak.map((w) => `${w.topic.name} (${w.rightLast} of ${w.questions} right)`).join(', ')}.</Text>
          <Button title="Build a review board" variant="outline" onPress={build} testID="cpa-weak-build" />
        </>
      ) : (
        <Text style={{ color: colors.textSecondary }} testID="cpa-weak-none">Nothing weak yet. Answer practice questions on a topic (at least a few different ones) and the topics you get wrong most will show up here.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: 8 }, title: { fontSize: 16 } });
