import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useProjectStore } from '../stores/projectStore';
import { childrenOf } from '../stores/projectTree';

/** On a project's page: the projects inside it (open one with a tap), the folder it is in, and a button to put a new project inside it. */
export const FolderContents: React.FC<{ projectId: string; onOpen: (id: string) => void; onNew: (parentId: string) => void }> = ({ projectId, onOpen, onNew }) => {
  const { colors } = useTheme();
  const projects = useProjectStore((s) => s.projects);
  const inside = childrenOf(projects, projectId);
  const parent = projects.find((p) => p.id === projects.find((x) => x.id === projectId)?.parentId);
  return (
    <View style={styles.box} testID="folder-contents">
      {!!parent && (
        <TouchableOpacity onPress={() => onOpen(parent.id)} accessibilityRole="button" testID="folder-parent">
          <Text style={{ color: colors.textMuted }}>Inside the folder <Text style={{ color: colors.primary }}>{parent.name}</Text>, which shares its documents with this project.</Text>
        </TouchableOpacity>
      )}
      {inside.length > 0 && <Text style={[styles.head, { color: colors.textSecondary }]}>Inside this project</Text>}
      {inside.map((p) => (
        <TouchableOpacity key={p.id} onPress={() => onOpen(p.id)} style={styles.row} accessibilityRole="button" testID={`folder-child-${p.id}`}>
          <Icon name="folder" size={16} color={colors.primary} />
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
          <Icon name="chevron-right" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => onNew(projectId)} accessibilityRole="button" testID="folder-new-inside">
        <Text style={{ color: colors.primary }}>New project inside this one</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  head: { ...TYPOGRAPHY.bodySmall },
  name: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xs },
});
