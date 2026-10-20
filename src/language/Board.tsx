import React from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import type { Space, SpaceKind } from './board';

const COLS = 4;
const GAP = 8;

/** Square colours by kind, from the theme (lessons plain, specials tinted so they stand out). */
function tint(kind: SpaceKind, colors: ThemeColors): string {
  if (kind === 'story') return `${colors.success}33`;
  if (kind === 'podcast') return `${colors.primary}33`;
  if (kind === 'speed' || kind === 'wordsearch') return `${colors.error}26`;
  return colors.surface;
}

/**
 * The board drawn like a board game: numbered squares in a snake (left to right, then right
 * to left), a pawn on the square you are on, tinted special squares (story, podcast, speed
 * round, word search), and stars on finished squares.
 */
export function Board({ spaces, isDone, isOpen, current, onPress }: {
  spaces: Space[]; isDone: (key: string) => boolean; isOpen: (i: number) => boolean; current: number;
  onPress: (s: Space, i: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const size = Math.floor((Math.min(width, 640) - SPACING.lg * 2 - GAP * (COLS - 1)) / COLS);
  const rows: Space[][] = [];
  for (let i = 0; i < spaces.length; i += COLS) rows.push(spaces.slice(i, i + COLS));
  return (
    <View style={styles.board} testID="language-board">
      {rows.map((row, r) => {
        const cells = row.map((s, c) => ({ s, i: r * COLS + c }));
        const ordered = r % 2 ? [...cells].reverse() : cells;
        return (
          <View key={r}>
            <View style={[styles.row, r % 2 ? styles.rowReverse : null]}>
              {ordered.map(({ s, i }) => {
                const done = isDone(s.key);
                const open = isOpen(i);
                return (
                  <TouchableOpacity key={s.key} testID={`space-${s.key}`} disabled={!open} onPress={() => onPress(s, i)}
                    accessibilityLabel={`${s.title}${open ? '' : ', locked'}${done ? ', done' : ''}`}
                    style={[styles.square, { width: size, height: size, backgroundColor: done ? colors.primary : tint(s.kind, colors) },
                      i === current && styles.current, !open && styles.locked]}>
                    <Text style={[styles.number, done && styles.onPrimary]}>{i + 1}</Text>
                    <Icon name={open ? s.icon : 'lock'} size={18} color={done ? colors.background : open ? colors.primary : colors.textMuted} />
                    <Text style={[styles.label, done && styles.onPrimary]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{s.title}</Text>
                    {i === current && <View style={styles.pawn}><Icon name="map-pin" size={20} color={colors.error} /></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
            {r < rows.length - 1 && (
              <View style={[styles.turn, r % 2 ? styles.turnLeft : styles.turnRight, { width: size }]}>
                <View style={styles.turnLine} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  board: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignSelf: 'center' as const },
  row: { flexDirection: 'row' as const, gap: GAP },
  rowReverse: { justifyContent: 'flex-end' as const },
  square: {
    borderRadius: 10, borderWidth: 2, borderColor: colors.border, padding: 4,
    alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2,
  },
  current: { borderColor: colors.primary, borderWidth: 3 },
  locked: { opacity: 0.45 },
  number: { ...TYPOGRAPHY.meta, color: colors.textMuted, position: 'absolute' as const, top: 2, left: 5 },
  label: { ...TYPOGRAPHY.meta, color: colors.text, textAlign: 'center' as const },
  onPrimary: { color: colors.background },
  pawn: { position: 'absolute' as const, top: -10, right: -6 },
  turn: { height: GAP * 2, alignItems: 'center' as const },
  turnRight: { alignSelf: 'flex-end' as const },
  turnLeft: { alignSelf: 'flex-start' as const },
  turnLine: { width: 4, flex: 1, backgroundColor: colors.border, borderRadius: 2 },
});
