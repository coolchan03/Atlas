import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useProjectStore } from '../stores/projectStore';
import { useNudges } from '../atlasTools/nudges';
import { dueItems, useStudyProgress } from '../study/progress';

/** One line on Home when review cards are due in any project: how many, where, and a button to the busiest project's review. */
export const ReviewDueCard: React.FC<{ onOpen: (projectId: string) => void }> = ({ onOpen }) => {
  const { colors } = useTheme();
  const wanted = useNudges((s) => s.reviewsDue);
  const items = useStudyProgress((s) => s.items);
  const projects = useProjectStore((s) => s.projects);
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of dueItems(null, Date.now(), 5000)) {
      if (projects.some((p) => p.id === i.projectId && (p.pinVerifier || p.protectedBlob))) continue; // never name a protected project
      counts.set(i.projectId, (counts.get(i.projectId) ?? 0) + 1);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { total: rows.reduce((n, [, c]) => n + c, 0), rows, top: rows[0]?.[0] };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` changes whenever a review is answered
  }, [items, projects]);
  if (!wanted || !summary.total || !summary.top) return null;
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Notes';
  const where = summary.rows.slice(0, 3).map(([id, n]) => `${name(id)} ${n}`).join(', ');
  return (
    <TouchableOpacity style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => onOpen(summary.top!)}
      accessibilityLabel={`Review ${summary.total} due cards`} testID="review-due">
      <Icon name="repeat" size={18} color={colors.primary} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{summary.total} review card{summary.total === 1 ? '' : 's'} due</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{where}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '400' },
  meta: { fontSize: 12 },
});
