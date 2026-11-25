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
export interface SourceSetup { profileId?: string; customProfile?: string; sourceRules?: string }

/** The same controls for anything that weighs sources: a project's documents, or what a Teach the AI subject reads. The owner keeps the values. */
export const SourceRulesFields: React.FC<{ value: SourceSetup; onChange: (patch: SourceSetup) => void; names?: string[]; disabled?: boolean }> = ({ value, onChange: update, names = [], disabled }) => {
  const { colors } = useTheme();
  const [rules, setRules] = React.useState(value.sourceRules ?? '');
  const [custom, setCustom] = React.useState(value.customProfile ?? '');
  const [showDefault, setShowDefault] = React.useState(false);
  const choice = value.profileId ?? 'auto';
  const problems = choice === 'custom' ? parseProfile(custom).problems : [];
  const active = profileFor(value.profileId, value.customProfile, names);
  return (
    <View style={styles.box} testID="source-rules">
      <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>What kind of documents are these?</Text>
      <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>
        The field decides which source outranks which, which are replaced by a newer edition, which are only true as of their date, and which official sites Atlas looks on for updates. Automatic picks federal tax when the project holds tax material.
      </Text>
      <View style={styles.chips}>
        {PROFILE_CHOICES.map((c) => (
          <TouchableOpacity key={c.id} disabled={disabled} onPress={() => update({ profileId: c.id })} accessibilityRole="radio" accessibilityState={{ selected: choice === c.id }} testID={`profile-${c.id}`}
            style={[styles.chip, { borderColor: choice === c.id ? colors.primary : colors.border }]}>
            <Text style={{ color: choice === c.id ? colors.primary : colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {choice === 'custom' && (
        <>
          <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.meta }}>One line per kind of source, highest first: Name | words that show a document is this kind | edition (a newer one replaces an older) or dated 30 (true as of its date, stale after 30 days). Then sites: and rules: lines.</Text>
          <TextInput value={custom} editable={!disabled} onChangeText={(v) => { setCustom(v.slice(0, 4000)); update({ customProfile: v.slice(0, 4000) }); }} multiline testID="profile-custom-text" placeholder={EXAMPLE} placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
          {problems.map((p) => <Text key={p} style={{ color: colors.error, ...TYPOGRAPHY.meta }} testID="profile-problem">{p}</Text>)}
        </>
      )}
      <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>Your own rules for reading these documents (optional)</Text>
      <TextInput value={rules} editable={!disabled} onChangeText={(v) => { setRules(v); update({ sourceRules: v.slice(0, 4000) }); }} multiline testID="source-rules-input" placeholder="For example: a filing outranks news about it; treat anything older than a week as stale" placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
      <TouchableOpacity onPress={() => setShowDefault(!showDefault)} accessibilityRole="button" testID="source-rules-default">
        <Text style={{ color: colors.primary, ...TYPOGRAPHY.meta }}>{showDefault ? 'Hide the rules in use' : 'Show the rules in use'}</Text>
      </TouchableOpacity>
      {showDefault && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }} testID="source-rules-default-text">{active ? rulesIn(active, rules) : rules.trim() || 'No field chosen, and none recognised from the documents, so no ranking is applied.'}</Text>}
    </View>
  );
};

/** A project's source setup, kept on the project. */
export const SourceRulesBox: React.FC<{ projectId: string; names?: string[] }> = ({ projectId, names }) => {
  const proj = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  return <SourceRulesFields value={proj ?? {}} names={names} onChange={(patch) => useProjectStore.getState().updateProject(projectId, patch)} />;
};

const styles = StyleSheet.create({
  box: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 90, textAlignVertical: 'top' },
});
