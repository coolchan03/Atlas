import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useProjectStore } from '../stores';
import { TAX_RULES } from '../standards/taxSources';

/**
 * How the AI should weigh this project's documents. Left empty, Atlas uses its built-in order of authority (the Code, regulations, court
 * decisions, IRS guidance, textbooks); written here, the person's own rules replace it for every chat in the project.
 */
export const SourceRulesBox: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { colors } = useTheme();
  const saved = useProjectStore((s) => s.projects.find((p) => p.id === projectId)?.sourceRules ?? '');
  const [text, setText] = React.useState(saved);
  const [showDefault, setShowDefault] = React.useState(false);
  const change = (value: string) => { setText(value); useProjectStore.getState().updateProject(projectId, { sourceRules: value.slice(0, 4000) }); };
  return (
    <View style={styles.box} testID="source-rules">
      <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>How to read these documents (optional)</Text>
      <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>
        Say which source wins and why, for example: the Code over regulations, a court decision only in its own circuit. Empty uses Atlas&apos;s built-in order of authority. Tap a document&apos;s type below it to correct what Atlas guessed.
      </Text>
      <TextInput value={text} onChangeText={change} multiline testID="source-rules-input" placeholder="Your rules for these sources" placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
      <TouchableOpacity onPress={() => setShowDefault(!showDefault)} accessibilityRole="button" testID="source-rules-default">
        <Text style={{ color: colors.primary, ...TYPOGRAPHY.meta }}>{showDefault ? 'Hide the built-in rules' : 'Show the built-in rules'}</Text>
      </TouchableOpacity>
      {showDefault && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="source-rules-default-text">{TAX_RULES}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 90, textAlignVertical: 'top' },
});
