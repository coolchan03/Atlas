import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';

export const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { padding: SPACING.xs },
  title: { ...TYPOGRAPHY.h2, flex: 1, color: colors.text },
  stat: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs },
  statText: { ...TYPOGRAPHY.label, color: colors.text },
  scroll: { paddingBottom: SPACING.xxl },
  langRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  // Three per row (A1 A2 B1 / B2 C1 C2); the level name wraps instead of being cut off.
  levels: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: SPACING.sm, paddingHorizontal: SPACING.lg },
  level: {
    flexGrow: 1, flexBasis: '30%' as const, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xs,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const,
  },
  levelOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelText: { ...TYPOGRAPHY.h3, color: colors.text },
  levelTextOn: { ...TYPOGRAPHY.h3, color: colors.background },
  levelSub: { ...TYPOGRAPHY.meta, color: colors.textMuted, textAlign: 'center' as const },
  levelSubOn: { ...TYPOGRAPHY.meta, color: colors.background, textAlign: 'center' as const },
  extras: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const,
    columnGap: SPACING.lg, rowGap: SPACING.xs, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
  },
  progressText: { ...TYPOGRAPHY.meta, color: colors.textMuted },
  extraOn: { ...TYPOGRAPHY.label, color: colors.primary },
  extraOff: { ...TYPOGRAPHY.label, color: colors.textMuted },
  note: { ...TYPOGRAPHY.meta, color: colors.textMuted, textAlign: 'center' as const, paddingHorizontal: SPACING.xl, marginTop: SPACING.md },
});
