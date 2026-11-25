import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button, Card } from '../components';
import { actionItemsText, findActionItems, type ActionItem } from './actionItems';
import type { Recording } from './store';
import { saveReminder } from '../schedule/reminders';
import { askForNotifications } from '../schedule/alarms';
import { shareItem } from '../utils/shareItem';

const dayText = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Pulls the promises, requests and dated to-dos out of a recorded conversation, then sets reminders for the ones with a day, or shares the list. */
export const ActionItemsCard: React.FC<{ rec: Recording }> = ({ rec }) => {
  const { title, utterances = [], speakerNames: names } = rec;
  const recordedAt = Date.parse(rec.createdAt) || Date.now();
  const { colors } = useTheme();
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const find = () => {
    const found = findActionItems(utterances, names, recordedAt);
    setItems(found); setNote('');
    setPicked(new Set(found.filter((a) => a.due && a.due > Date.now()).map((a) => a.id)));
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remind = () => {
    const chosen = (items ?? []).filter((a) => picked.has(a.id) && a.due && a.due > Date.now());
    for (const a of chosen) {
      const d = new Date(a.due as number);
      saveReminder({ text: `${a.text} (${a.owner})`, repeat: 'once', hour: d.getHours(), minute: d.getMinutes(), onceAt: a.due });
    }
    if (chosen.length) void askForNotifications();
    setNote(chosen.length ? `${chosen.length} reminder${chosen.length === 1 ? '' : 's'} set. See them under Scheduled tasks.` : 'Tick items that have a day to set reminders for them.');
  };

  if (!utterances.length) return null;
  return (
    <Card title="Action items" subtitle="Promises, requests and to-dos found in the transcript. Nothing is made up: each one is a sentence someone said." testID="recording-actions">
      <Button title={items ? 'Find them again' : 'Find action items'} size="small" variant="outline" onPress={find} testID="actions-find" />
      {items && items.length === 0 && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="actions-none">No promises or requests were found in this conversation.</Text>}
      {(items ?? []).map((a) => (
        <TouchableOpacity key={a.id} style={styles.row} onPress={() => toggle(a.id)} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(a.id) }} testID={`action-${a.id}`}>
          <Icon name={picked.has(a.id) ? 'check-square' : 'square'} size={18} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={[styles.text, { color: colors.text }]}>{a.text}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{a.owner}{a.due ? ` · by ${dayText(a.due)}${a.due > Date.now() ? '' : ' (already passed)'}` : ' · no day mentioned'}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {!!items?.length && (
        <View style={styles.actions}>
          <Button title="Set reminders" size="small" onPress={remind} testID="actions-remind" />
          <Button title="Share the list" size="small" variant="outline" onPress={() => { void shareItem({ title: `Action items: ${title}`, text: actionItemsText(title, items) }); }} testID="actions-share" />
        </View>
      )}
      {!!note && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="actions-note">{note}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.sm },
  flex: { flex: 1 },
  text: { ...TYPOGRAPHY.body },
  meta: { ...TYPOGRAPHY.bodySmall },
  actions: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', marginTop: SPACING.sm },
});
