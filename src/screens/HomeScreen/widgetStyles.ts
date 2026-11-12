import { StyleSheet } from 'react-native';
import { SPACING, TYPOGRAPHY } from '../../constants';

/** Layout shared by the cards that live inside a Home widget row. Colors come from the theme at the call site. */
export const widgetStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: SPACING.md, marginTop: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  detail: { ...TYPOGRAPHY.bodySmall, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  link: { marginTop: 10 },
  input: { ...TYPOGRAPHY.body, minHeight: 72, borderWidth: 1, borderRadius: 8, padding: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  pushRight: { marginLeft: 'auto' },
});
