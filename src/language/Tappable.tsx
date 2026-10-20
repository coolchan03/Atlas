import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, type TextStyle } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { languageService, plainWord } from './languageService';

/**
 * Text in the language being learned where every word can be tapped to see its English
 * meaning (from the lessons and stories on the phone, or asked of the AI once and kept).
 */
export function Tappable({ text, style, testID }: { text: string; style?: TextStyle; testID?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState<{ word: string; meaning: string | null } | null>(null);
  const tap = (word: string) => {
    if (!plainWord(word)) return;
    if (open?.word === word) { setOpen(null); return; }
    setOpen({ word, meaning: null });
    languageService.lookupWord(word)
      .then((m) => setOpen((o) => (o?.word === word ? { word, meaning: m || 'No meaning found' } : o)))
      .catch(() => setOpen((o) => (o?.word === word ? { word, meaning: 'Load the AI model to look this word up' } : o)));
  };
  const parts = text.split(/(\s+)/);
  return (
    <View testID={testID}>
      <Text style={style}>
        {parts.map((p, i) => (/\s+/.test(p) ? p : (
          <Text key={i} onPress={() => tap(p)} style={open?.word === p ? styles.picked : undefined} accessibilityRole="button" accessibilityLabel={`Meaning of ${p}`}>{p}</Text>
        )))}
      </Text>
      {open && (
        <TouchableOpacity onPress={() => setOpen(null)} style={styles.bubble} testID="word-meaning">
          {open.meaning === null ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.bubbleText}><Text style={styles.bubbleWord}>{plainWord(open.word)}</Text> = {open.meaning}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  picked: { backgroundColor: `${colors.primary}33`, color: colors.primary },
  bubble: {
    alignSelf: 'flex-start' as const, marginTop: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary,
  },
  bubbleText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  bubbleWord: { ...TYPOGRAPHY.label, color: colors.primary },
});
