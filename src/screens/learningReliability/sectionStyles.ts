import { StyleSheet } from 'react-native';
import { SPACING, TYPOGRAPHY } from '../../constants';

/** Layout shared by the sections of the learning dashboard. Colors come from the theme where each is used. */
export const sectionStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md },
  title: { ...TYPOGRAPHY.h3 },
  note: { ...TYPOGRAPHY.bodySmall },
  small: { ...TYPOGRAPHY.bodySmall, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  grow: { flex: 1 },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: 8, padding: SPACING.sm },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  button: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
});
