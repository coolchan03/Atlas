import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { TYPOGRAPHY } from '../constants';
import { defaultRole, roleOf } from '../standards/docRoles';
import { useOfficialDocs } from '../standards/officialDocs';
import { classifyTaxSource, supersededEditions, type TaxKind } from '../standards/taxSources';

/** The types a person can give a document, in the order a tap steps through them; after the last, back to what Atlas guessed. */
const KINDS: Array<{ kind: TaxKind | 'none'; label: string }> = [
  { kind: 'statute', label: 'Internal Revenue Code' }, { kind: 'publicLaw', label: 'Public Law' }, { kind: 'regulation', label: 'Treasury regulation' },
  { kind: 'court', label: 'Court decision' }, { kind: 'bulletin', label: 'IRS ruling, procedure or notice' }, { kind: 'publication', label: 'IRS publication' },
  { kind: 'textbook', label: 'Textbook or notes' }, { kind: 'none', label: 'Not tax material' },
];

/**
 * Under a document's name: what it is for (it teaches lessons, or it is reference the lessons are checked against: tap to switch), and a note
 * when a newer edition of the same work is in the project, so the older one is not used.
 */
export const DocRoleLine: React.FC<{ name: string; names: string[] }> = ({ name, names }) => {
  const { colors } = useTheme();
  useOfficialDocs((s) => s.roles); // re-render when a role changes
  useOfficialDocs((s) => s.names);
  const chosen = useOfficialDocs((s) => s.kinds?.[name]);
  const guessed = classifyTaxSource(name);
  const showKind = !!chosen || !!guessed || names.some((n) => !!classifyTaxSource(n));
  const nextKind = () => {
    const at = KINDS.findIndex((k) => k.kind === chosen);
    useOfficialDocs.getState().setKind(name, at + 1 < KINDS.length ? KINDS[at + 1].kind : null);
  };
  const kindText = chosen ? KINDS.find((k) => k.kind === chosen)?.label : guessed ? `${guessed.label}${guessed.detail ? `, ${guessed.detail}` : ''}` : 'Not recognised as tax material';
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
