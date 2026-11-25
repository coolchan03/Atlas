import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { learningKnowledgeDb } from '../learning/knowledgeDb';
import { digestLines } from '../learning/digest';
import { useLearningStore } from '../learning/store';

/** "Since you last looked": what a subject gained (for example overnight), worked out from the saved knowledge, not written by a model. */
export const LearningDigestCard: React.FC<{ agentId: string; changed: number }> = ({ agentId, changed }) => {
  const { colors } = useTheme();
  const looked = useLearningStore((s) => s.looked?.[agentId] ?? 0);
  const { lines, newest } = useMemo(() => {
    try {
      const d = learningKnowledgeDb.digestSince(agentId, looked);
      return { lines: digestLines(d), newest: d.newest };
    } catch { return { lines: [] as string[], newest: [] as string[] }; }
  }, [agentId, looked, changed]);
  if (!lines.length) return null;
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="learning-digest">
      <View style={styles.head}>
        <Icon name="clock" size={16} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>{looked ? `Since you last looked, ${new Date(looked).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Since the start'}</Text>
      </View>
      {lines.map((l) => <Text key={l} style={[styles.line, { color: colors.textSecondary }]}>{l}</Text>)}
      {newest.slice(0, 3).map((t) => <Text key={t} style={[styles.meta, { color: colors.textMuted }]}>{`Newest: ${t.slice(0, 140)}`}</Text>)}
      <TouchableOpacity onPress={() => useLearningStore.getState().markLooked(agentId)} accessibilityRole="button" testID="learning-digest-seen">
        <Text style={[styles.action, { color: colors.primary }]}>Mark as read</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, gap: SPACING.xs, marginBottom: SPACING.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.body },
  line: { ...TYPOGRAPHY.bodySmall },
  meta: { ...TYPOGRAPHY.meta },
  action: { ...TYPOGRAPHY.bodySmall, paddingVertical: SPACING.xs },
});
