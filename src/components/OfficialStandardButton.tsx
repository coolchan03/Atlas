import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { isOfficialDocumentName } from '../standards/authority';
import { useOfficialDocs } from '../standards/officialDocs';

/**
 * A shield on a document: filled when Atlas treats it as the standard itself (FASB and so on), which overrules textbooks. Press to mark
 * it, or to take the mark off. Re-renders when the marks change.
 */
export const OfficialStandardButton: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const { colors } = useTheme();
  useOfficialDocs((s) => s.names); // re-render when a mark is added or removed
  const official = isOfficialDocumentName(name);
  const marked = useOfficialDocs.getState().names.includes(name);
  const toggle = () => (marked ? useOfficialDocs.getState().unmark(name) : useOfficialDocs.getState().mark(name));
  return (
    <TouchableOpacity onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: official }}
      accessibilityLabel={official ? 'This is the official standard. Press to treat it as a normal document' : 'Mark as the official standard, which overrules textbooks'}
      testID={`official-${name}`} hitSlop={8}>
      <Icon name="shield" size={size} color={official ? colors.primary : colors.textMuted} />
    </TouchableOpacity>
  );
};
