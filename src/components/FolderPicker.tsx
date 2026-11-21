import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useProjectStore } from '../stores/projectStore';
import { descendantsOf } from '../stores/projectTree';

/** Choose the folder a project goes inside: none (top level), or any project that is not itself or inside itself. */
export const FolderPicker: React.FC<{ projectId?: string; value?: string; onChange: (parentId: string | undefined) => void }> = ({ projectId, value, onChange }) => {
  const { colors } = useTheme();
  const projects = useProjectStore((s) => s.projects);
  const blocked = new Set(projectId ? [projectId, ...descendantsOf(projects, projectId).map((p) => p.id)] : []);
  const options = projects.filter((p) => !blocked.has(p.id) && p.course !== 'language' && !p.pinVerifier);
  const chip = ({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) => (
    <TouchableOpacity key={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} testID={testID}
      style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
      <Text style={{ color: on ? colors.background : colors.text }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="folder-picker">
      {chip({ label: 'Top level', on: !value, onPress: () => onChange(undefined), testID: 'folder-none' })}
      {options.map((p) => chip({ label: p.name, on: value === p.id, onPress: () => onChange(p.id), testID: `folder-${p.id}` }))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  chip: { ...TYPOGRAPHY.bodySmall, borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, maxWidth: 220 },
});
