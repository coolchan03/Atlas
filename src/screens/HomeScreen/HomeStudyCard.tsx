import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { useTopics } from '../../topics/store';
import { dueCount } from '../../topics/review';
import { useExerciseStore } from '../../study/exercises';
import { useCpa } from '../../cpa/store';
import { examLabel } from '../../cpa/blueprints';
import { useChatStore, useProjectStore } from '../../stores';
import { addDailyReminder } from '../../atlasTools/deviceTools';
import { weakestTopic, continueTarget, nextExamLine, searchHome, type HomeHit, type HomeSearchSources } from './homeStudy';

/** Pick up studying in one tap: the next square of the course you played last, what is due for review, and how the nearest exam is going. */
export function HomeStudyCard({ navigation }: { navigation: any }) {
  const { colors } = useTheme();
  const courses = useTopics((s) => s.courses);
  const examState = useCpa((s) => s.exams);
  const target = useMemo(() => continueTarget(courses), [courses]);
  const due = dueCount();
  const exercises = useExerciseStore((st) => st.exercises);
  const progress = useExerciseStore((st) => st.progress);
  const weak = useMemo(() => weakestTopic(Object.values(exercises), progress), [exercises, progress]);
  const exam = useMemo(() => nextExamLine(Object.entries(examState).map(([code, e]) => ({ label: examLabel(code as any), examDate: e?.examDate, remaining: (e?.topics ?? []).filter((t) => !t.covered).length })).filter((e) => e.examDate)), [examState]);
  if (!target && !due && !exam && !weak) return null;
  const remind = () => { const until = Object.values(examState).map((e) => e?.examDate).filter(Boolean).sort()[0]; addDailyReminder('Study with Atlas', { until, description: 'Open Atlas and carry on with your course.' }).then((m) => Alert.alert('Reminder', m)).catch((e) => Alert.alert('Could not open the calendar', String(e?.message || e))); };
  const go = (screen: string, params?: object) => navigation.getParent()?.navigate(screen, params);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="home-study">
      {target && (
        <TouchableOpacity style={styles.row} onPress={() => go('TopicSquare', { courseId: target.courseId, key: target.key })} testID="home-continue" accessibilityRole="button">
          <Icon name="play" size={18} color={colors.primary} />
          <View style={styles.grow}>
            <Text style={[styles.title, { color: colors.text }]}>Continue: {target.squareTitle}</Text>
            <Text style={[styles.small, { color: colors.textSecondary }]}>{target.title} · {target.done} of {target.total} squares</Text>
          </View>
        </TouchableOpacity>
      )}
      {due > 0 && (
        <TouchableOpacity style={styles.row} onPress={() => go('Practice')} testID="home-review" accessibilityRole="button">
          <Icon name="repeat" size={18} color={colors.primary} />
          <Text style={[styles.title, styles.grow, { color: colors.text }]}>{due} question{due === 1 ? '' : 's'} to review</Text>
        </TouchableOpacity>
      )}
      {weak && (
        <TouchableOpacity style={styles.row} onPress={() => go('Practice', { ...(weak.projectId ? { projectId: weak.projectId } : {}), topic: weak.topic })} testID="home-weak" accessibilityRole="button">
          <Icon name="target" size={18} color={colors.primary} />
          <Text style={[styles.title, styles.grow, { color: colors.text }]}>Weakest topic: {weak.topic} ({weak.percent}% right)</Text>
        </TouchableOpacity>
      )}
      {!!exam && <Text style={[styles.small, { color: colors.textSecondary }]} testID="home-exam-line">{exam}</Text>}
      <TouchableOpacity style={styles.row} onPress={remind} testID="home-remind" accessibilityRole="button">
        <Icon name="bell" size={18} color={colors.primary} />
        <Text style={[styles.small, styles.grow, { color: colors.primary }]}>Remind me to study every day (opens your calendar)</Text>
      </TouchableOpacity>
    </View>
  );
}

/** One box that finds any screen, course, project or chat by its name. */
export function HomeSearch({ navigation, tiles, onTile }: { navigation: any; tiles: HomeSearchSources['tiles']; onTile: (key: string) => void }) {
  const { colors } = useTheme();
  const [query, setQuery] = React.useState('');
  const courses = useTopics((s) => s.courses);
  const projects = useProjectStore((s) => s.projects);
  const chats = useChatStore((s) => s.conversations);
  const hits = useMemo(() => searchHome(query, { tiles, courses, projects, chats }), [query, tiles, courses, projects, chats]);
  const open = (h: HomeHit) => {
    setQuery('');
    const parent = navigation.getParent();
    if (h.kind === 'screen') onTile(h.id);
    else if (h.kind === 'course') parent?.navigate('TopicBoard', { courseId: h.id });
    else if (h.kind === 'project') parent?.navigate('ProjectDetail', { projectId: h.id });
    else parent?.navigate('Chat', { conversationId: h.id });
  };
  return (
    <View style={styles.search}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search screens, courses, projects, chats" placeholderTextColor={colors.textMuted} testID="home-search"
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityLabel="Search Atlas" returnKeyType="search" />
      {hits.map((h) => (
        <TouchableOpacity key={`${h.kind}-${h.id}`} onPress={() => open(h)} style={styles.row} testID={`home-hit-${h.kind}-${h.id}`} accessibilityRole="button">
          <Text style={[styles.title, styles.grow, { color: colors.text }]} numberOfLines={1}>{h.label}</Text>
          <Text style={[styles.small, { color: colors.textMuted }]}>{h.kind === 'screen' ? 'Screen' : h.hint}</Text>
        </TouchableOpacity>
      ))}
      {!!query.trim() && !hits.length && <Text style={[styles.small, { color: colors.textSecondary }]}>Nothing matches. Try one word.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  grow: { flex: 1 },
  title: { ...TYPOGRAPHY.body },
  small: { ...TYPOGRAPHY.bodySmall },
  search: { marginBottom: SPACING.md },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
