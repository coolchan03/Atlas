import React from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { useAutoMemory } from '../stores/autoMemory';

/** Opt-in memory review; sensitive therapy facts always require confirmation. */
export function MemoryReviewCard() {
  const { colors } = useTheme();
  const enabled = useAutoMemory((s) => s.enabled);
  const therapyReview = useAutoMemory((s) => s.therapyReview);
  const autoSavePreferences = useAutoMemory((s) => s.autoSavePreferences);
  const pending = useAutoMemory((s) => s.pending);
  const { set, approve, dismiss } = useAutoMemory.getState();
  const toggle = (enabledNext: boolean) => {
    if (!enabledNext) { set({ enabled: false }); return; }
    Alert.alert('Automatic memory', 'Atlas can notice explicit preferences and offer to remember them. This feature does not send messages to a cloud service. Therapy facts always require approval. Approved items are added to the general About You profile and may be included in other chats; avoid approving very private information.', [
      { text: 'Cancel' }, { text: 'Enable', onPress: () => set({ enabled: true }) },
    ]);
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="memory-review-card">
      <Text style={[styles.title, { color: colors.text }]}>Remember about me</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Atlas can notice lasting facts in your messages. Review them below; you can delete saved memories in About You. Private and PIN-locked chat messages are never scanned by this feature. Approved memories go into About You and can be used in other chats; do not save details you wish to keep restricted to therapy.</Text>
      <View style={styles.row}>
        <Text style={[styles.note, styles.flex, { color: colors.text }]}>Suggest memories from chats</Text>
        <Switch value={enabled} onValueChange={toggle} />
      </View>
      {enabled && <>
        <View style={styles.row}>
          <Text style={[styles.note, styles.flex, { color: colors.text }]}>Automatically remember simple non-sensitive preferences</Text>
          <Switch value={autoSavePreferences} onValueChange={(autoSavePreferences) => set({ autoSavePreferences })} />
        </View>
        <View style={styles.row}>
          <Text style={[styles.note, styles.flex, { color: colors.text }]}>Offer therapy memory suggestions (always review before saving)</Text>
          <Switch value={therapyReview} onValueChange={(therapyReview) => set({ therapyReview })} />
        </View>
      </>}
      {!!pending.length && <Text style={[styles.title, { color: colors.text }]}>Memory suggestions ({pending.length})</Text>}
      {pending.map((m) => (
        <View key={m.id} style={[styles.item, { borderTopColor: colors.border }]}>
          <Text style={[styles.note, { color: colors.text }]}>{m.source === 'therapy' ? 'Therapy · review required' : 'Preference'}: {m.fact}</Text>
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={() => approve(m.id)}><Text style={{ color: colors.primary }}>Remember</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => dismiss(m.id)}><Text style={{ color: colors.textMuted }}>Dismiss</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 10, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  note: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingTop: 9 },
  flex: { flex: 1 },
  item: { borderTopWidth: 1, paddingVertical: 10, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 8 },
});
