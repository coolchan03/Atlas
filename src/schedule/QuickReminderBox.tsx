import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { parseReminder } from './quickReminder';
import { saveReminder } from './reminders';
import { askForNotifications } from './alarms';
import { SPACING, TYPOGRAPHY } from '../constants';

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
    const when = saveReminder(r);
    setFailed(false); setNote(`Reminder set: ${r.text}, ${when}.`); setText('');
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
  box: { gap: SPACING.xs },
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  input: { ...TYPOGRAPHY.body, flex: 1, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md },
  button: { borderRadius: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  note: { ...TYPOGRAPHY.bodySmall },
});
