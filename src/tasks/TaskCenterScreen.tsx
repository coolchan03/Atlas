import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ScreenHeader';
import { displayTitle, isActive, progressPercent, useTasks, type Task } from './taskRegistry';

const LABEL: Record<Task['status'], string> = { queued: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };

/** Running, waiting, finished and failed work in one place, with Cancel, Retry and Dismiss. Failed jobs stay until dismissed. */
export const TaskCenterScreen: React.FC = () => {
  const { colors } = useTheme();
  const tasks = useTasks((s) => s.tasks);
  const { cancel, retry, dismiss } = useTasks.getState();
  const action = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity key={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={[styles.action, { borderColor: colors.border }]}>
      <Text style={{ color: colors.primary }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Task center" />
      <ScrollView contentContainerStyle={styles.body}>
        {tasks.length === 0 && <Text style={{ color: colors.textSecondary }} testID="tasks-empty">Nothing is running. Imports, downloads and other long jobs appear here while they work, and stay here if they fail.</Text>}
        {tasks.map((t) => {
          const pct = progressPercent(t);
          return (
            <View key={t.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID={`task-${t.id}`}>
              <View style={styles.row}>
                <Icon name={t.status === 'failed' || t.status === 'interrupted' ? 'alert-circle' : t.status === 'done' ? 'check-circle' : 'loader'} size={18} color={colors.primary} />
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{displayTitle(t)}</Text>
              </View>
              <Text style={{ color: colors.textSecondary }} testID={`task-status-${t.id}`}>
                {LABEL[t.status]}{t.stage ? `: ${t.stage}` : ''}{pct !== null ? ` (${pct}%)` : ''}
              </Text>
              {!!t.error && <Text style={{ color: colors.textSecondary }}>{t.error}</Text>}
              <View style={styles.row}>
                {isActive(t) && !t.cancelRequested && action('Cancel', () => cancel(t.id), `task-cancel-${t.id}`)}
                {t.cancelRequested && isActive(t) && <Text style={{ color: colors.textMuted }}>Stopping at a safe point...</Text>}
                {!!t.retryable && ['failed', 'cancelled', 'interrupted'].includes(t.status) && action('Retry', () => retry(t.id), `task-retry-${t.id}`)}
                {!isActive(t) && action('Dismiss', () => dismiss(t.id), `task-dismiss-${t.id}`)}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 15, flexShrink: 1 },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
});
