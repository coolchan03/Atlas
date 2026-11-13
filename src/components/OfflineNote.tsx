import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useOffGrid } from '../atlasTools/offGridState';

/** A line that says a feature needs the internet and that off-grid mode is on, so it explains itself before it fails. Shows nothing when off-grid mode is off. */
export function OfflineNote({ what }: { what: string }) {
  const { colors } = useTheme();
  const on = useOffGrid((s) => s.on);
  if (!on) return null;
  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="offline-note" accessibilityLiveRegion="polite">
      <Icon name="wifi-off" size={16} color={colors.textSecondary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>Off-grid mode is on, so {what} needs the internet and will not work until you turn it off in Settings.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderRadius: 10, padding: SPACING.md, marginVertical: SPACING.sm },
  text: { ...TYPOGRAPHY.bodySmall, flex: 1 },
});
