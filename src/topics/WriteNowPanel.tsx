import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { friendlyTitle } from './chapters';
import { Fold } from '../components/Fold';
import { cancelWriteNow, missingAll, missingInUnit, nextMissing, unitsOf, useBatch, writeNow } from './prepare';
import type { Course } from './store';

const NEXT = [5, 10, 20];

/** Writes squares now, instead of when you reach them: the next few, a whole chapter, or the whole course. Shows which one is being written and which failed. */
export function WriteNowPanel({ course }: { course: Course }) {
  const { colors } = useTheme();
  const batch = useBatch();
  const mine = batch.courseId === course.id;
  const running = mine && !!batch.working;
  const link = ({ label, onPress, testID, disabled = false }: { label: string; onPress: () => void; testID: string; disabled?: boolean }) => (
    <TouchableOpacity key={testID} onPress={onPress} disabled={disabled || running} accessibilityRole="button" testID={testID} style={styles.link}>
      <Text style={{ color: disabled || running ? colors.textMuted : colors.primary }}>{label}</Text>
    </TouchableOpacity>
  );
  const units = unitsOf(course).filter((u) => u.total > 0);
  const title = (key: string) => course.squares.find((q) => q.key === key)?.title ?? '';
  return (
    <View style={styles.box} testID="course-write-now">
      <Text style={[styles.head, { color: colors.textSecondary }]}>Write squares now</Text>
      <View style={styles.row}>
        {NEXT.map((n) => link({ label: `Next ${n}`, onPress: () => void writeNow(course.id, nextMissing(course, n), `the next ${n}`), testID: `write-next-${n}`, disabled: !nextMissing(course, n).length }))}
        {link({ label: 'Whole course', onPress: () => void writeNow(course.id, missingAll(course), 'the whole course'), testID: 'write-all', disabled: !missingAll(course).length })}
      </View>
      {running && (
        <TouchableOpacity onPress={cancelWriteNow} accessibilityRole="button" testID="write-cancel" style={styles.link}><Text style={{ color: colors.error }}>Cancel writing</Text></TouchableOpacity>
      )}
      {mine && batch.total > 0 && (
        <Text style={{ color: colors.textMuted }} testID="write-now-status">
          {running ? `Writing "${title(batch.working)}" (${batch.done + 1} of ${batch.total}, ${batch.label}).` : `Finished ${batch.label}: ${batch.total - batch.failed.length} of ${batch.total} written.`}
          {!!batch.failed.length && ` ${batch.failed.length} could not be written (${batch.error.slice(0, 80)}). They are written when you open them.`}
        </Text>
      )}
      {units.length > 1 && (
        <Fold title="Or write one chapter or topic" testID="write-now-chapters">
          {units.map((u) => (
            <View key={u.unit} style={styles.unit}>
              <Text style={[styles.unitName, { color: colors.text }]} numberOfLines={1}>{friendlyTitle(u.unit)}</Text>
              <Text style={{ color: colors.textMuted }}>{u.written}/{u.total}</Text>
              {link({ label: u.written === u.total ? 'Written' : 'Write all', onPress: () => void writeNow(course.id, missingInUnit(course, u.unit), u.unit), testID: `write-unit-${u.unit}`, disabled: u.written === u.total })}
            </View>
          ))}
        </Fold>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: SPACING.sm },
  head: { ...TYPOGRAPHY.bodySmall },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg },
  link: { paddingVertical: SPACING.xs },
  unit: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  unitName: { ...TYPOGRAPHY.bodySmall, flex: 1 },
});
