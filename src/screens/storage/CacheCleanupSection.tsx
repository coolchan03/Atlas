import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Card } from '../../components';
import { useTheme } from '../../theme';
import { formatBytes } from '../../utils/formatBytes';
import { clearCaches, scanCaches, type CacheItem } from '../../services/cacheCleanup';

/** Caches Atlas rebuilds itself, with exact sizes. Only proven-disposable ones are ticked; models, documents, chats and backups are never listed. */
export const CacheCleanupSection: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { colors } = useTheme();
  const [items, setItems] = useState<CacheItem[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const scan = useCallback(async () => {
    const found = await scanCaches();
    setItems(found); setPicked(Object.fromEntries(found.map((i) => [i.id, i.safeByDefault])));
  }, []);
  useEffect(() => { void scan(); }, [scan]);
  const chosen = (items ?? []).filter((i) => picked[i.id]);
  const total = chosen.reduce((n, i) => n + i.bytes, 0);
  const run = () => Alert.alert(`Free ${formatBytes(total)}?`, `${chosen.map((i) => `${i.label} (${formatBytes(i.bytes)}): ${i.rebuild}`).join('\n')}\n\nYour models, documents, chats and backups are not touched. This cannot be undone, but all of it is rebuilt when needed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Free space', onPress: async () => { const freed = await clearCaches(chosen); setMessage(`Freed ${formatBytes(freed)}.`); await scan(); onChanged?.(); } },
  ]);
  if (!items || items.length === 0) return null;
  return (
    <Card style={styles.card} testID="cache-cleanup">
      <Text style={[styles.title, { color: colors.text }]}>Free up space</Text>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>Temporary files Atlas makes again when it needs them.</Text>
      {items.map((i) => (
        <TouchableOpacity key={i.id} onPress={() => setPicked((p) => ({ ...p, [i.id]: !p[i.id] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!picked[i.id] }} testID={`cache-${i.id}`}
          style={styles.row}>
          <Icon name={picked[i.id] ? 'check-square' : 'square'} size={18} color={colors.primary} />
          <View style={styles.grow}>
            <Text style={{ color: colors.text }}>{i.label}: {formatBytes(i.bytes)}</Text>
            <Text style={[styles.small, { color: colors.textMuted }]}>{i.note ?? i.rebuild}</Text>
          </View>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={run} disabled={!chosen.length} accessibilityRole="button" testID="cache-free" style={styles.free}>
        <Text style={{ color: chosen.length ? colors.primary : colors.textMuted }}>{chosen.length ? `Free ${formatBytes(total)}` : 'Nothing selected'}</Text>
      </TouchableOpacity>
      {!!message && <Text style={{ color: colors.textSecondary }} testID="cache-message">{message}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 16 },
  intro: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48 },
  grow: { flex: 1 },
  small: { fontSize: 12 },
  free: { minHeight: 44, justifyContent: 'center' },
});
