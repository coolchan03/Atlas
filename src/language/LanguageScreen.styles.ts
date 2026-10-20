import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';

export const NODE = 68;

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
  langRow: { gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  chipTextOn: { ...TYPOGRAPHY.bodySmall, color: colors.background },
  levels: { flexDirection: 'row' as const, gap: SPACING.xs, paddingHorizontal: SPACING.lg },
  level: { flex: 1, paddingVertical: SPACING.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' as const },
  levelOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelText: { ...TYPOGRAPHY.meta, color: colors.text },
  levelTextOn: { ...TYPOGRAPHY.meta, color: colors.background },
  extras: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.lg, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  extraOn: { ...TYPOGRAPHY.label, color: colors.primary },
  extraOff: { ...TYPOGRAPHY.label, color: colors.textMuted },
  kind: { ...TYPOGRAPHY.meta, color: colors.textMuted },
  meta: { ...TYPOGRAPHY.meta, color: colors.textMuted, flex: 1 },
  board: { paddingVertical: SPACING.lg, paddingBottom: SPACING.xxl, alignItems: 'center' as const },
  stop: { alignItems: 'center' as const, width: 160 },
  link: { width: 4, height: 28, borderRadius: 2, backgroundColor: colors.border },
  linkDone: { backgroundColor: colors.primary },
  node: {
    width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.border,
  },
  nodeDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  nodeCurrent: { borderColor: colors.primary },
  nodeLocked: { opacity: 0.45 },
  nodeNumber: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginTop: SPACING.xs },
  nodeTitle: { ...TYPOGRAPHY.bodySmall, color: colors.text, textAlign: 'center' as const },
  stars: { flexDirection: 'row' as const, gap: 2, marginTop: 2 },
  token: { position: 'absolute' as const, top: -14, right: 30 },
  note: { ...TYPOGRAPHY.meta, color: colors.textMuted, textAlign: 'center' as const, paddingHorizontal: SPACING.xl, marginTop: SPACING.md },
});
