import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../components';
import { useTheme } from '../../theme';
import { restoreFromTrash, TRASH_DAYS, useTrash } from '../../trash/trash';

/** Chats and courses deleted in the last days, with Restore. Protected and private items are never listed (their deletion is permanent). */
export const RecentlyDeletedSection: React.FC = () => {
  const { colors } = useTheme();
  const items = useTrash((s) => s.items);
  useEffect(() => { useTrash.getState().purgeExpired(); }, []);
  if (items.length === 0) return null;
  return (
    <Card style={styles.card} testID="recently-deleted">
      <Text style={[styles.title, { color: colors.text }]}>Recently deleted</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Kept for {TRASH_DAYS} days, then gone for good. Locked and private items are not kept.</Text>
      {items.map((i) => (
        <View key={i.id} style={styles.row} testID={`trash-${i.id}`}>
          <Text style={[styles.grow, { color: colors.text }]} numberOfLines={1}>{i.kind === 'chat' ? 'Chat' : 'Course'}: {i.title}</Text>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel={`Restore ${i.title}`} testID={`trash-restore-${i.id}`}
            onPress={() => { const why = restoreFromTrash(i.id); if (why) Alert.alert('Not restored', why); }}>
            <Text style={{ color: colors.primary }}>Restore</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityLabel={`Delete ${i.title} for good`} testID={`trash-discard-${i.id}`}
            onPress={() => Alert.alert('Delete for good?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => useTrash.getState().discard(i.id) }])}>
            <Text style={{ color: colors.error }}>Delete</Text>
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
