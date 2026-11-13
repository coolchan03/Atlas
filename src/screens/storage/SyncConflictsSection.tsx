import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../components';
import { useTheme } from '../../theme';
import { listConflictCopies, restoreConflictCopy, type ConflictCopy } from '../../services/nearbySync/conflictCopies';

const NAMES: Record<string, string> = { 'atlas-agents': 'Characters', 'atlas-about-me': 'About me', 'atlas-schedule': 'Scheduled tasks', 'atlas-pins': 'Pins', 'atlas-skills': 'Skills' };

/** Versions of a setting or list that syncing replaced on this phone, with a way to put them back. */
export const SyncConflictsSection: React.FC = () => {
  const { colors } = useTheme();
  const [items, setItems] = useState<ConflictCopy[]>([]);
  const load = useCallback(async () => setItems(await listConflictCopies()), []);
  useEffect(() => { void load(); }, [load]);
  if (!items.length) return null;
  return (
    <Card style={styles.card} testID="sync-conflicts">
      <Text style={[styles.title, { color: colors.text }]}>Replaced by sync</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>The other phone had a newer version, so this phone's version was kept here for two weeks.</Text>
      {items.map((c) => (
        <View key={c.id} style={styles.row}>
          <Text style={[styles.grow, { color: colors.text }]} numberOfLines={1}>{NAMES[c.key] ?? c.key}, {new Date(c.replacedAt).toLocaleDateString()}</Text>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel={`Put back this phone's version of ${NAMES[c.key] ?? c.key}`} testID={`conflict-restore-${c.id}`}
            onPress={() => Alert.alert('Put this version back?', "The version from the other phone is kept here instead, so you can switch back.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Put back', onPress: async () => { await restoreConflictCopy(c.id); await load(); } }])}>
            <Text style={{ color: colors.primary }}>Put back</Text>
          </TouchableOpacity>
        </View>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 16 },
  note: { marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  grow: { flex: 1 },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 6 },
});
