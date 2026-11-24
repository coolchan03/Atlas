import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { TYPOGRAPHY } from '../constants';
import { defaultRole, roleOf } from '../standards/docRoles';
import { useOfficialDocs } from '../standards/officialDocs';
import { classifyTaxSource, supersededEditions } from '../standards/taxSources';
import { classifyIn, profileFor } from '../standards/profiles';
import { useProjectStore } from '../stores';

/** The types a person can give a document in federal tax. */
const TAX_TYPES: Array<{ kind: string; label: string }> = [
  { kind: 'statute', label: 'Internal Revenue Code' }, { kind: 'publicLaw', label: 'Public Law' }, { kind: 'regulation', label: 'Treasury regulation' },
  { kind: 'court', label: 'Court decision' }, { kind: 'bulletin', label: 'IRS ruling, procedure or notice' }, { kind: 'publication', label: 'IRS publication' },
  { kind: 'textbook', label: 'Textbook or notes' },
];

/**
 * Under a document's name: what it is for (it teaches lessons, or it is reference the lessons are checked against: tap to switch), and a note
 * when a newer edition of the same work is in the project, so the older one is not used.
 */
export const DocRoleLine: React.FC<{ name: string; names: string[]; projectId?: string }> = ({ name, names, projectId }) => {
  const { colors } = useTheme();
  useOfficialDocs((s) => s.roles); // re-render when a role changes
  useOfficialDocs((s) => s.names);
  const chosen = useOfficialDocs((s) => s.kinds?.[name]);
  const proj = useProjectStore((s) => (projectId ? s.projects.find((p) => p.id === projectId) : undefined));
  const profile = profileFor(proj?.profileId, proj?.customProfile, names);
  const types = [...(profile === 'federal-tax' ? TAX_TYPES : profile ? profile.types.map((t) => ({ kind: t.id, label: t.label })) : []), { kind: 'none', label: 'Not a source of this kind' }];
  const showKind = !!profile || !!chosen;
  const nextKind = () => {
    const at = types.findIndex((k) => k.kind === chosen);
    useOfficialDocs.getState().setKind(name, at + 1 < types.length ? types[at + 1].kind : null);
  };
  const guessed = !profile ? null : profile === 'federal-tax' ? classifyTaxSource(name)?.label ?? null : classifyIn(profile, name)?.type.label ?? null;
  const kindText = chosen ? types.find((k) => k.kind === chosen)?.label ?? chosen : guessed ?? 'Not recognised';
  const role = roleOf(name);
  const older = supersededEditions(names).has(name);
  const set = (next: 'teach' | 'reference') => useOfficialDocs.getState().setRole(name, next === defaultRole(name) ? null : next);
  return (
    <>
      <TouchableOpacity onPress={() => set(role === 'teach' ? 'reference' : 'teach')} accessibilityRole="switch" accessibilityState={{ checked: role === 'reference' }}
        accessibilityLabel={role === 'teach' ? 'Lessons are taught from this. Press to use it only as a reference to check lessons against' : 'Used only to check lessons against. Press to teach lessons from it'} testID={`role-${name}`}>
        <Text style={[styles.text, { color: colors.textMuted }]}>{role === 'teach' ? 'Teaches lessons' : 'Reference: checks lessons'}</Text>
      </TouchableOpacity>
      {showKind && (
        <TouchableOpacity onPress={nextKind} accessibilityRole="button" accessibilityLabel={`Type of source: ${kindText}. Press to change it`} testID={`kind-${name}`}>
          <Text style={[styles.text, { color: colors.textMuted }]}>{`Type: ${kindText}${chosen ? ' (set by you)' : ''}`}</Text>
        </TouchableOpacity>
      )}
      {older && <Text style={[styles.text, { color: colors.warning ?? colors.textMuted }]} testID={`older-${name}`}>Older edition: not used, a newer one is in this project</Text>}
    </>
  );
};

const styles = StyleSheet.create({ text: { ...TYPOGRAPHY.meta } });
