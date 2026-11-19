import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

export interface SelectOption { id: string; label: string; hint?: string }

/**
 * A drop-down: the label and the current choice in one line; tapping opens a list. One choice (the list closes on tapping), or several
 * (`multiple`: each tap switches an option on or off and the list stays open until Done).
 */
export function Select({ label, options, value, values, multiple, onChange, onToggle, disabled, testID, summary }: {
  label: string; options: SelectOption[]; value?: string; values?: string[]; multiple?: boolean;
  onChange?: (id: string) => void; onToggle?: (id: string) => void; disabled?: boolean; testID?: string; /** Text shown as the current choice (default: the chosen option's label). */ summary?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const chosen = multiple ? (values ?? []) : value !== undefined ? [value] : [];
  const current = summary ?? (multiple ? (chosen.length ? `${chosen.length} chosen` : 'Any') : (options.find((o) => o.id === value)?.label ?? ''));
  const pick = (id: string) => { if (multiple) onToggle?.(id); else { onChange?.(id); setOpen(false); } };
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} accessibilityState={{ disabled: !!disabled }} testID={testID}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }]}>
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text style={[styles.fieldValue, { color: colors.text }]} numberOfLines={1}>{current}</Text>
        </View>
        <Icon name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
            <ScrollView style={styles.list}>
              {options.map((o) => {
                const on = chosen.includes(o.id);
                return (
                  <TouchableOpacity key={o.id} onPress={() => pick(o.id)} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={multiple ? { checked: on } : { selected: on }} testID={`${testID ?? 'select'}-${o.id}`} style={styles.option}>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionLabel, { color: colors.text }]}>{o.label}</Text>
                      {!!o.hint && <Text style={[styles.optionHint, { color: colors.textMuted }]}>{o.hint}</Text>}
                    </View>
                    {on && <Icon name="check" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {multiple && <TouchableOpacity onPress={() => setOpen(false)} style={styles.done} testID={`${testID ?? 'select'}-done`}><Text style={{ color: colors.primary }}>Done</Text></TouchableOpacity>}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  fieldText: { flex: 1 },
  fieldLabel: { ...TYPOGRAPHY.meta },
  fieldValue: { ...TYPOGRAPHY.body },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACING.xl },
  sheet: { borderRadius: SPACING.md, padding: SPACING.lg, maxHeight: '80%' },
  sheetTitle: { ...TYPOGRAPHY.body, marginBottom: SPACING.sm },
  list: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  optionText: { flex: 1 },
  optionLabel: { ...TYPOGRAPHY.body },
  optionHint: { ...TYPOGRAPHY.bodySmall },
  done: { alignSelf: 'flex-end', paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm },
});
