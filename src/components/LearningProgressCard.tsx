import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import type { ProgressSection } from '../learning/progressSummary';

/** Progress as separate parts (checked knowledge, claims that disagree, practice, exam), each with its own numbers and none blended into one score. */
export const LearningProgressCard: React.FC<{ sections: ProgressSection[] }> = ({ sections }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card} testID="learning-progress">
      {sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.title}>{s.title}</Text>
          {s.lines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
        </View>
      ))}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { backgroundColor: colors.surface, borderRadius: SPACING.sm, padding: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: colors.border },
  section: { marginBottom: SPACING.sm },
  title: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginBottom: SPACING.xs },
  line: { ...TYPOGRAPHY.bodySmall, color: colors.text },
});
