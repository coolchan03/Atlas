import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

export interface RowAction { id: string; label: string; icon: string; destructive?: boolean; onPress: () => void }

/**
 * One way to act on a list item, the same everywhere: swipe it sideways to reveal its actions (Delete is a button you press, never done by
 * the swipe itself), or press and hold to open a sheet with the same actions as buttons. A short tap still does what the row does. Nothing
 * is deleted by holding or swiping alone.
 */
export function SwipeRow({ actions, title, onPress, children, testID }: { actions: RowAction[]; title?: string; onPress?: () => void; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const swipe = useRef<{ close: () => void } | null>(null);
  const [sheet, setSheet] = useState(false);
  const run = (a: RowAction) => { swipe.current?.close(); setSheet(false); a.onPress(); };
  // The swipe shows the first three actions (the sheet lists all of them).
  const shown = actions.slice(0, 3);
  return (
    <>
      <Swipeable ref={swipe as never} overshootRight={false} renderRightActions={() => (
        <View style={styles.actions}>
          {shown.map((a) => (
            <TouchableOpacity key={a.id} onPress={() => run(a)} accessibilityLabel={a.label} testID={`swipe-action-${a.id}`}
              style={[styles.action, { backgroundColor: a.destructive ? colors.error : colors.surfaceLight }]}>
              <Icon name={a.icon} size={18} color={a.destructive ? colors.background : colors.text} />
              <Text style={[styles.actionText, { color: a.destructive ? colors.background : colors.text }]} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}>
        <Pressable onPress={onPress} onLongPress={() => setSheet(true)} delayLongPress={400} testID={testID} accessibilityHint="Swipe sideways or press and hold for more options">
          {children}
        </Pressable>
      </Swipeable>
      <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setSheet(false)} testID="row-sheet-backdrop">
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            {!!title && <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{title}</Text>}
            {actions.map((a) => (
              <TouchableOpacity key={a.id} onPress={() => run(a)} accessibilityLabel={a.label} testID={`sheet-action-${a.id}`} style={styles.sheetRow}>
                <Icon name={a.icon} size={18} color={a.destructive ? colors.error : colors.primary} />
                <Text style={[styles.sheetText, { color: a.destructive ? colors.error : colors.text }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSheet(false)} accessibilityLabel="Cancel" testID="sheet-cancel" style={styles.sheetRow}>
              <Icon name="x" size={18} color={colors.textMuted} />
              <Text style={[styles.sheetText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'stretch' },
  action: { minWidth: 72, paddingHorizontal: SPACING.md, alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  actionText: { ...TYPOGRAPHY.meta },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: SPACING.lg, paddingBottom: SPACING.xl, borderTopLeftRadius: SPACING.lg, borderTopRightRadius: SPACING.lg, gap: SPACING.xs },
  title: { ...TYPOGRAPHY.body, marginBottom: SPACING.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  sheetText: { ...TYPOGRAPHY.body },
});
