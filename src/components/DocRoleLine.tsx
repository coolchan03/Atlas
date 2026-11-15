import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme';
import { TYPOGRAPHY } from '../constants';
import { defaultRole, roleOf } from '../standards/docRoles';
import { useOfficialDocs } from '../standards/officialDocs';
import { supersededEditions } from '../standards/taxSources';

/**
 * Under a document's name: what it is for (it teaches lessons, or it is reference the lessons are checked against: tap to switch), and a note
 * when a newer edition of the same work is in the project, so the older one is not used.
 */
export const DocRoleLine: React.FC<{ name: string; names: string[] }> = ({ name, names }) => {
  const { colors } = useTheme();
  useOfficialDocs((s) => s.roles); // re-render when a role changes
  useOfficialDocs((s) => s.names);
  const role = roleOf(name);
  const older = supersededEditions(names).has(name);
  const set = (next: 'teach' | 'reference') => useOfficialDocs.getState().setRole(name, next === defaultRole(name) ? null : next);
  return (
    <>
      <TouchableOpacity onPress={() => set(role === 'teach' ? 'reference' : 'teach')} accessibilityRole="switch" accessibilityState={{ checked: role === 'reference' }}
        accessibilityLabel={role === 'teach' ? 'Lessons are taught from this. Press to use it only as a reference to check lessons against' : 'Used only to check lessons against. Press to teach lessons from it'} testID={`role-${name}`}>
        <Text style={[styles.text, { color: colors.textMuted }]}>{role === 'teach' ? 'Teaches lessons' : 'Reference: checks lessons'}</Text>
      </TouchableOpacity>
      {older && <Text style={[styles.text, { color: colors.warning ?? colors.textMuted }]} testID={`older-${name}`}>Older edition: not used, a newer one is in this project</Text>}
    </>
  );
};

const styles = StyleSheet.create({ text: { ...TYPOGRAPHY.meta } });
