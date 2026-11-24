import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { useProjectStore } from '../stores';
import { PROFILE_CHOICES, parseProfile, profileFor, rulesIn } from '../standards/profiles';

const EXAMPLE = 'Statutes | statute, code, u.s.c | edition\nRegulations | regulation, cfr | edition\nCase law | circuit, court, opinion\nCommentary | treatise, law review\nsites: congress.gov, govinfo.gov\nrules: The statute controls. A newer case does not override it.';

/**
 * How the AI should weigh this project's documents: which field it is (federal tax, accounting, equities, crypto, law, or one the person
 * writes), and optional rules of their own that replace the built-in ones. Dated material (prices, news) is marked stale, and editions of
 * the same work are replaced by the newest, according to the field.
 */
export const SourceRulesBox: React.FC<{ projectId: string; names?: string[] }> = ({ projectId, names = [] }) => {
  const { colors } = useTheme();
  const proj = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const [rules, setRules] = React.useState(proj?.sourceRules ?? '');
  const [custom, setCustom] = React.useState(proj?.customProfile ?? '');
  const [showDefault, setShowDefault] = React.useState(false);
  const choice = proj?.profileId ?? 'auto';
  const update = (patch: { profileId?: string; sourceRules?: string; customProfile?: string }) => useProjectStore.getState().updateProject(projectId, patch);
  const problems = choice === 'custom' ? parseProfile(custom).problems : [];
  const active = profileFor(proj?.profileId, proj?.customProfile, names);
  return (
    <View style={styles.box} testID="source-rules">
      <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>What kind of documents are these?</Text>
      <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>
        The field decides which source outranks which, which are replaced by a newer edition, which are only true as of their date, and which official sites Atlas looks on for updates. Automatic picks federal tax when the project holds tax material.
      </Text>
      <View style={styles.chips}>
        {PROFILE_CHOICES.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => update({ profileId: c.id })} accessibilityRole="radio" accessibilityState={{ selected: choice === c.id }} testID={`profile-${c.id}`}
            style={[styles.chip, { borderColor: choice === c.id ? colors.primary : colors.border }]}>
            <Text style={{ color: choice === c.id ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {choice === 'custom' && (
        <>
          <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>One line per kind of source, highest first: Name | words that show a document is this kind | edition (a newer one replaces an older) or dated 30 (true as of its date, stale after 30 days). Then sites: and rules: lines.</Text>
          <TextInput value={custom} onChangeText={(v) => { setCustom(v.slice(0, 4000)); update({ customProfile: v.slice(0, 4000) }); }} multiline testID="profile-custom-text" placeholder={EXAMPLE} placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          {problems.map((p) => <Text key={p} style={{ color: colors.error, ...TYPOGRAPHY.meta }} testID="profile-problem">{p}</Text>)}
        </>
      )}
      <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>Your own rules for reading these documents (optional)</Text>
      <TextInput value={rules} onChangeText={(v) => { setRules(v); update({ sourceRules: v.slice(0, 4000) }); }} multiline testID="source-rules-input" placeholder="For example: a filing outranks news about it; treat anything older than a week as stale" placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
      <TouchableOpacity onPress={() => setShowDefault(!showDefault)} accessibilityRole="button" testID="source-rules-default">
        <Text style={{ color: colors.primary, ...TYPOGRAPHY.meta }}>{showDefault ? 'Hide the rules in use' : 'Show the rules in use'}</Text>
      </TouchableOpacity>
      {showDefault && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="source-rules-default-text">{active ? rulesIn(active, rules) : rules.trim() || 'No field chosen, and none recognised from the documents, so no ranking is applied.'}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 90, textAlignVertical: 'top' },
});
