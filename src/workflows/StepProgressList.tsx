import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import type { ProgressItem } from './stepProgress';

/** A list of steps, each with a mark for waiting (empty circle), running (spinner) or done (tick), and what a running step is doing. */
export const StepProgressList: React.FC<{ items: ProgressItem[]; testID?: string }> = ({ items, testID = 'step-progress' }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.list} testID={testID}>
      {items.map((item, i) => (
        <View key={`${i}-${item.label}`} style={styles.row} testID={`${testID}-${i}`} accessibilityLabel={`${item.label}: ${item.state === 'done' ? 'done' : item.state === 'running' ? 'in progress' : 'waiting'}`}>
          {item.state === 'running' ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name={item.state === 'done' ? 'check-circle' : 'circle'} size={16} color={item.state === 'done' ? colors.primary : colors.textMuted} />}
          <View style={styles.text}>
            <Text style={{ color: item.state === 'waiting' ? colors.textMuted : colors.text, ...TYPOGRAPHY.bodySmall }}>{item.label}</Text>
            {item.state !== 'done' && !!item.note && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>{item.note}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: SPACING.xs, paddingVertical: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  text: { flex: 1 },
});
