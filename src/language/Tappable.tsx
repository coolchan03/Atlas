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
  const [table, setTable] = useState<{ verb: string; tenses: { name: string; lines: string[] }[] | null; error?: string } | null>(null);
  const tap = (word: string) => {
    if (!plainWord(word)) return;
    if (open?.word === word) { setOpen(null); setTable(null); return; }
    setOpen({ word, meaning: null });
    setTable(null);
    languageService.lookupWord(word)
      .then((m) => setOpen((o) => (o?.word === word ? { word, meaning: m || 'No meaning found' } : o)))
      .catch(() => setOpen((o) => (o?.word === word ? { word, meaning: 'Load the AI model to look this word up' } : o)));
  };
  const verb = open?.meaning ? languageService.verbOf(open.word, open.meaning) : null;
  const showTable = (v: string) => {
    if (table?.verb === v) { setTable(null); return; }
    setTable({ verb: v, tenses: null });
    languageService.conjugation(v)
      .then((tenses) => setTable((t) => (t?.verb === v ? { verb: v, tenses } : t)))
      .catch((e) => setTable((t) => (t?.verb === v ? { verb: v, tenses: null, error: String(e?.message || e) } : t)));
  };
  const parts = text.split(/(\s+)/);
  return (
    <View testID={testID}>
      <Text style={style}>
        {parts.map((p, i) => (/\s+/.test(p) ? p : (
          <Text key={i} onPress={() => tap(p)} style={open?.word === p ? styles.picked : styles.tappable} accessibilityRole="button" accessibilityLabel={`Meaning of ${p}`}>{p}</Text>
        )))}
      </Text>
      {open && (
        <TouchableOpacity onPress={() => setOpen(null)} style={styles.bubble} testID="word-meaning">
          {open.meaning === null ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.bubbleText}><Text style={styles.bubbleWord}>{plainWord(open.word)}</Text> = {open.meaning}</Text>}
        </TouchableOpacity>
      )}
      {!!verb && (
        <TouchableOpacity onPress={() => showTable(verb)} style={styles.conjugate} testID="word-conjugate" accessibilityLabel={`How to conjugate ${verb}`}>
          <Text style={styles.bubbleWord}>{table?.verb === verb ? 'Hide' : 'How to conjugate'} {verb}</Text>
        </TouchableOpacity>
      )}
      {table && (
        <View style={styles.table} testID="conjugation-table">
          {table.tenses === null && !table.error && <ActivityIndicator size="small" color={colors.primary} />}
          {!!table.error && <Text style={styles.bubbleText}>{table.error}</Text>}
          {table.tenses?.map((t) => (
            <View key={t.name} style={styles.tense}>
              <Text style={styles.tenseName}>{t.name}</Text>
              {t.lines.map((l) => <Text key={l} style={styles.bubbleText}>{l}</Text>)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  // A dotted underline shows that a word can be tapped for its meaning.
  tappable: { textDecorationLine: 'underline' as const, textDecorationStyle: 'dotted' as const, textDecorationColor: colors.textMuted },
  picked: { backgroundColor: `${colors.primary}33`, color: colors.primary },
  conjugate: { alignSelf: 'flex-start' as const, marginTop: SPACING.xs, paddingVertical: SPACING.xs },
  table: { marginTop: SPACING.xs, padding: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: SPACING.sm },
  tense: { gap: 2 },
  tenseName: { ...TYPOGRAPHY.meta, color: colors.textMuted },
  bubble: {
    alignSelf: 'flex-start' as const, marginTop: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary,
  },
  bubbleText: { ...TYPOGRAPHY.bodySmall, color: colors.text },
  bubbleWord: { ...TYPOGRAPHY.label, color: colors.primary },
});
