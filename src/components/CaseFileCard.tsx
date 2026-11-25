import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button } from './Button';
import { useProjectStore } from '../stores';
import { classifyIn, profileFor, supersededIn } from '../standards/profiles';
import { caseTreatment } from '../standards/caseStatus';
import { caseNameFrom, useCaseFile } from '../standards/caseFile';
import { offGridOn } from '../atlasTools/offGridState';
import { searchWeb } from '../services/tools/webSearchProviders';
import { braveSearch } from '../services/tools/braveSearch';

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A law project's case file: its documents in order of authority (what outranks what), older editions marked as not used, and for each court
 * decision whether later courts or lawmakers have treated it badly, found with the web search. It is a search for warning words, not a
 * citator: a flagged case needs its pages read, and a clean one is not proof it is still good law. Shown only for projects set to law.
 */
export const CaseFileCard: React.FC<{ projectId: string; names: string[] }> = ({ projectId, names }) => {
  const { colors } = useTheme();
  const proj = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const checks = useCaseFile((s) => s.checks[projectId]) ?? {};
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const profile = profileFor(proj?.profileId, proj?.customProfile, names);
  if (!profile || profile === 'federal-tax' || profile.id !== 'law') return null;
  const older = supersededIn(profile, names);
  const groups = profile.types.map((t) => ({ type: t, docs: names.filter((n) => classifyIn(profile, n)?.type.id === t.id) })).filter((g) => g.docs.length);
  const loose = names.filter((n) => !classifyIn(profile, n));

  const check = async (document: string) => {
    setProblem('');
    if (offGridOn()) { setProblem('Off-grid mode is on, so the web cannot be searched.'); return; }
    setBusy(document);
    try {
      const t = await caseTreatment(caseNameFrom(document), async (q) => (await searchWeb(q, braveSearch)).results);
      useCaseFile.getState().record(projectId, document, { at: Date.now(), results: t.hits.length, negative: t.negative, flagged: t.hits.filter((h) => h.negative).slice(0, 2).map((h) => h.title.slice(0, 80)) });
    } catch (e) { setProblem((e as Error)?.message || 'The check failed.'); } finally { setBusy(''); }
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="case-file">
      <Text style={[styles.title, { color: colors.text }]}>Case file</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>Your documents, highest authority first. When two disagree, the higher one decides.</Text>
      {groups.map((g, i) => (
        <View key={g.type.id} style={styles.group}>
          <Text style={[styles.label, { color: colors.text }]}>{`${i + 1}. ${g.type.label} (${g.docs.length})`}</Text>
          {g.docs.map((d) => {
            const found = checks[d];
            return (
              <View key={d} style={styles.doc}>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{d}{older.has(d) ? ' · older edition, not used' : ''}</Text>
                {g.type.id === 'case' && (
                  <>
                    {found && (
                      <Text style={[styles.meta, { color: found.negative ? colors.warning ?? colors.error : colors.textMuted }]} testID={`case-check-${d}`}>
                        {found.negative
                          ? `Checked ${day(found.at)}: ${found.negative} of ${found.results} results have warning words (${found.flagged.join('; ')}). Open them before relying on this case.`
                          : `Checked ${day(found.at)}: no warning words in ${found.results} results. This is a web search, not a citator.`}
                      </Text>
                    )}
                    <Button title={busy === d ? 'Checking...' : found ? 'Check again' : 'Is it still good law?'} size="small" variant="outline" disabled={!!busy} onPress={() => { void check(d); }} testID={`case-check-btn-${d}`} />
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}
      {loose.length > 0 && <Text style={[styles.meta, { color: colors.textMuted }]}>{`Not recognised as any kind of source (set its type below): ${loose.join(', ')}`}</Text>}
      {!!problem && <Text style={[styles.meta, { color: colors.error }]} testID="case-file-problem">{problem}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, gap: SPACING.sm, marginVertical: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  label: { ...TYPOGRAPHY.body },
  meta: { ...TYPOGRAPHY.bodySmall },
  group: { gap: SPACING.xs },
  doc: { gap: SPACING.xs, paddingLeft: SPACING.md },
});
