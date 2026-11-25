import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useProjectStore } from '../stores';
import { useResearchLibraryStore } from '../stores/researchLibraryStore';
import { importLibraryZip, removeLibrary } from '../services/researchLibrary/install';

const createStyles = (colors: ThemeColors, _s: ThemeShadows) => ({
  box: { marginHorizontal: SPACING.lg, marginVertical: SPACING.sm, padding: SPACING.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const },
  title: { ...TYPOGRAPHY.h3, color: colors.text, flex: 1, fontWeight: '400' as const },
  note: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: SPACING.xs },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: SPACING.sm },
  name: { ...TYPOGRAPHY.body, color: colors.text, fontWeight: '400' as const },
  meta: { ...TYPOGRAPHY.labelSmall, color: colors.textMuted },
  action: { padding: SPACING.sm },
  grow: { flex: 1 },
});

const mb = (bytes: number): string => (bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/**
 * Research libraries in a project's Knowledge Base: large read-only collections that arrive pre-indexed (a .zip with an
 * atlas-library.json). Installed once for the device, then switched on for the projects that use them. Atlas searches them where
 * they are; it does not copy their text into the project or build embeddings for them.
 */
export function ResearchLibrariesSection({ projectId }: { projectId: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const libraries = useResearchLibraryStore((s) => s.libraries);
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const [busy, setBusy] = useState<string | null>(null);
  const attached = project?.researchLibraryIds ?? [];

  const toggle = (id: string) => updateProject(projectId, { researchLibraryIds: attached.includes(id) ? attached.filter((x) => x !== id) : [...attached, id] });
  const add = async () => {
    setBusy('Starting...');
    try {
      const lib = await importLibraryZip(setBusy);
      if (lib) { toggle(lib.id); Alert.alert('Library installed', `${lib.name} is installed and switched on for this project.`); }
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) Alert.alert('Could not install the library', e?.message || 'Unknown error');
    } finally { setBusy(null); }
  };
  const remove = (id: string, name: string) => Alert.alert(`Remove ${name}?`, 'This deletes the library from this device. Projects that used it stop searching it. The original zip is not affected.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { void removeLibrary(id); } },
  ]);

  return (
    <View style={styles.box} testID="research-libraries">
      <View style={styles.head}>
        <Text style={styles.title}>Research libraries</Text>
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : (
          <TouchableOpacity onPress={add} accessibilityLabel="Install a research library from a .zip" testID="library-install"><Icon name="download" size={20} color={colors.primary} /></TouchableOpacity>
        )}
      </View>
      {busy ? <Text style={styles.note}>{busy}</Text> : null}
      {libraries.length === 0 && !busy ? <Text style={styles.note}>Large, pre-indexed collections of original documents (law, standards, manuals). Install one from a .zip; Atlas searches it in place and never rewrites it.</Text> : null}
      {libraries.map((l) => (
        <View key={l.id} style={styles.row}>
          <TouchableOpacity onPress={() => toggle(l.id)} accessibilityRole="switch" accessibilityState={{ checked: attached.includes(l.id) }} testID={`library-toggle-${l.id}`} style={styles.action}>
            <Icon name={attached.includes(l.id) ? 'check-square' : 'square'} size={20} color={attached.includes(l.id) ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.grow}>
            <Text style={styles.name}>{l.name}</Text>
            <Text style={styles.meta}>{`version ${l.version}, ${mb(l.sizeBytes)}, read-only`}</Text>
          </View>
          <TouchableOpacity onPress={() => remove(l.id, l.name)} accessibilityLabel={`Remove ${l.name}`} style={styles.action}><Icon name="trash-2" size={18} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
