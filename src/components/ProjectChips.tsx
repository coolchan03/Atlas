import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useProjectStore } from '../stores/projectStore';
import { SPACING } from '../constants';

/** Horizontal picker of project folders ('' = none). Used wherever something can be connected to a project's documents. */
export function ProjectChips({ value, onChange, colors, testID = 'project-chips' }: { value: string; onChange: (id: string) => void; colors: any; testID?: string }) {
  const projects = useProjectStore((s) => s.projects).filter((p) => !p.pinVerifier);
  const items = [{ id: '', name: 'None' }, ...projects.map((p) => ({ id: p.id, name: p.name }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} testID={testID}>
      {items.map((p) => {
        const on = p.id === value;
        return (
          <TouchableOpacity key={p.id || 'none'} onPress={() => onChange(p.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`${testID}-${p.id || 'none'}`}
            style={[styles.chip, { backgroundColor: on ? colors.primary : colors.surface }]}>
            <Text numberOfLines={1} style={{ color: on ? colors.background : colors.text }}>{p.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: SPACING.xs },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8, maxWidth: 220 },
});
