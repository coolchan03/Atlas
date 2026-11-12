import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { Card } from '../../components';
import { TYPOGRAPHY, SPACING } from '../../constants';
import { loadStorageGroups, type StorageGroup, type StorageItem } from '../../storage/storageGroups';

const size = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
};

/** Everything Atlas keeps on this phone, grouped, each with its size and a Delete button that says what it will break. */
export const StorageItemsSection: React.FC = () => {
  const { colors } = useTheme();
  const [groups, setGroups] = useState<StorageGroup[] | null>(null);
  const refresh = useCallback(() => { loadStorageGroups().then(setGroups).catch(() => setGroups([])); }, []);
  useEffect(refresh, [refresh]);

  const confirmDelete = (item: StorageItem) => Alert.alert(`Delete ${item.name}?`, item.warning ?? 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { item.remove().then(refresh).catch((e) => Alert.alert('Could not delete', String(e?.message || e))); } },
  ]);

  if (groups === null) return null;
  if (!groups.length) return <Card><Text style={[styles.empty, { color: colors.textSecondary }]}>Nothing downloaded or recorded yet.</Text></Card>;
  return (
    <>
      {groups.map((group) => (
        <Card key={group.id} style={styles.card} testID={`storage-group-${group.id}`}>
          <Text style={[styles.title, { color: colors.text }]}>{group.title}</Text>
          {group.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{size(item.bytes)}{item.detail ? ` · ${item.detail}` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} testID={`storage-delete-${item.id}`} hitSlop={8}>
                <Icon name="trash-2" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: SPACING.md },
  title: { ...TYPOGRAPHY.h3, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, gap: SPACING.md },
  info: { flex: 1 },
  name: { ...TYPOGRAPHY.body },
  meta: { ...TYPOGRAPHY.meta },
  empty: { ...TYPOGRAPHY.body },
});
