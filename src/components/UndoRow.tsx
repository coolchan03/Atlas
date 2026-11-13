import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

export const UNDO_WAIT_MS = 8000;

/**
 * Removing something takes effect at once and waits a few seconds for an Undo, instead of asking "Are you sure?" first.
 * `remove(label, doRemove, restore)` runs the removal now and keeps `restore` for the Undo; `<UndoRow />` shows the bar.
 */
export function useUndo() {
  const [pending, setPending] = useState<{ label: string; restore: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setPending(null); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const remove = useCallback((label: string, doRemove: () => void, restore: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    doRemove();
    setPending({ label, restore });
    timer.current = setTimeout(clear, UNDO_WAIT_MS);
  }, [clear]);
  const undo = useCallback(() => { pending?.restore(); clear(); }, [pending, clear]);
  return { pending, remove, undo };
}

export function UndoRow({ pending, undo }: { pending: { label: string } | null; undo: () => void }) {
  const { colors } = useTheme();
  if (!pending) return null;
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="undo-row" accessibilityLiveRegion="polite">
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>Removed {pending.label}</Text>
      <TouchableOpacity onPress={undo} accessibilityRole="button" accessibilityLabel={`Undo removing ${pending.label}`} testID="undo-button" hitSlop={8}>
        <Text style={{ color: colors.primary }}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, padding: SPACING.md, marginVertical: SPACING.sm },
  text: { ...TYPOGRAPHY.body, flex: 1, marginRight: SPACING.md },
});
