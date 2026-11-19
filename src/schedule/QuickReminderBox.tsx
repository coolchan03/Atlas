import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { describeTiming } from './due';
import { parseReminder } from './quickReminder';
import { useSchedule } from './store';
import { askForNotifications } from './alarms';

/** One line to make a reminder: "call Mom tomorrow at 9am", "stretch every weekday at 8", "check the oven in 20 minutes". No AI is used to read it. */
export const QuickReminderBox: React.FC = () => {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const add = () => {
    const parsed = parseReminder(text, Date.now());
    if (!parsed.ok) { setFailed(true); setNote(parsed.error); return; }
    const r = parsed.reminder;
    const timing = { repeat: r.repeat, hour: r.hour, minute: r.minute, ...(r.weekday !== undefined ? { weekday: r.weekday } : {}), ...(r.onceAt !== undefined ? { onceAt: r.onceAt } : {}) };
    useSchedule.getState().add({ name: r.text.slice(0, 60), kind: 'prompt', prompt: `This is a reminder I set for myself: "${r.text}". Remind me in one short sentence.`, ...timing });
    setFailed(false); setNote(`Reminder set: ${r.text}, ${describeTiming({ ...timing, createdAt: Date.now() }).toLowerCase()}.`); setText('');
    void askForNotifications();
  };
  return (
    <View style={styles.box} testID="quick-reminder">
      <View style={styles.row}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={add} placeholder="Remind me: call Mom tomorrow at 9am" placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Quick reminder" testID="quick-reminder-input" returnKeyType="done" />
        <TouchableOpacity onPress={add} style={[styles.button, { backgroundColor: colors.primary }]} accessibilityLabel="Add the reminder" testID="quick-reminder-add">
          <Text style={{ color: colors.background }}>Add</Text>
        </TouchableOpacity>
      </View>
      {!!note && <Text style={[styles.note, { color: failed ? colors.error : colors.textSecondary }]} testID="quick-reminder-note">{note}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  button: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 11 },
  note: { fontSize: 13 },
});
