import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

/** A heading that opens and closes the extra controls under it, so a screen shows its main job first and the rest on request. */
export function Fold({ title, children, defaultOpen = false, testID }: { title: string; children: React.ReactNode; defaultOpen?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View testID={testID}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={testID ? `${testID}-toggle` : undefined} style={styles.row}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={18} color={colors.primary} />
        <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>
      </TouchableOpacity>
      {open && <View>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  title: { ...TYPOGRAPHY.body },
});
