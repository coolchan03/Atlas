import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { quotedSentence, lessonText, unbackedLines } from './citations';
import { sourcePage } from './service';
import type { SquareContent } from './formats';
import type { Rewrite } from './service';

interface Passage { source: string; url?: string; docId?: number; where?: string; text: string }

/**
 * Where a square came from: each source with its page, part or paragraph (a web page is a link; a page of your own book opens in full),
 * the passages, with the sentence the lesson leans on highlighted, and the lines no passage backs.
 */
export function CitedFold({ passages, content }: { passages: Passage[]; content?: SquareContent | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<{ key: string; text: string } | null>(null);
  if (!passages.length) return null;
  const lesson = lessonText(content);
  const unbacked = unbackedLines(content, passages);
  const sources = passages.filter((p, i) => passages.findIndex((q) => q.source === p.source && q.where === p.where) === i);
  const label = (p: Passage) => `${p.source}${p.where ? `, ${p.where}` : ''}`;
  const openPage = async (p: Passage) => {
    const key = label(p);
    if (page?.key === key) { setPage(null); return; }
    setPage({ key, text: p.docId != null ? (await sourcePage(p.docId, p.where)) || p.text : p.text });
  };
  return (
    <View testID="square-cited" style={styles.gap}>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Where this came from</Text>
      {sources.map((p) => (p.url
        ? <Text key={label(p)} style={[styles.link, { color: colors.primary }]} accessibilityRole="link" onPress={() => Linking.openURL(p.url!)} testID="square-source-link">{label(p)}</Text>
        : <Text key={label(p)} style={[styles.link, { color: colors.primary }]} accessibilityRole="button" onPress={() => openPage(p)} testID="square-source-open">{label(p)}</Text>))}
      {!!page && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="square-source-page">
          <Text style={[styles.meta, { color: colors.textMuted }]}>{page.key}</Text>
          <Text style={{ color: colors.textSecondary }}>{page.text}</Text>
        </View>
      )}
      {unbacked.length > 0 && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="square-unbacked">
          <Text style={[styles.meta, { color: colors.textMuted }]}>Not found in your sources (from the AI's own knowledge, so check it)</Text>
          {unbacked.map((l, i) => <Text key={i} style={{ color: colors.textSecondary }}>{l}</Text>)}
        </View>
      )}
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" testID="square-cited-toggle">
        <Text style={{ color: colors.primary }}>{open ? 'Hide' : 'Show'} the passages ({passages.length} from your sources)</Text>
      </TouchableOpacity>
      {open && passages.map((p, i) => {
        const q = quotedSentence(p.text, lesson);
        return (
          <View key={i} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{label(p)}</Text>
            <Text style={{ color: colors.textSecondary }} testID="square-passage">
              {q.before}<Text style={[styles.hit, { backgroundColor: `${colors.primary}33`, color: colors.text }]} testID="square-quoted">{q.hit}</Text>{q.after}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  meta: { fontSize: 13 },
  link: { textDecorationLine: 'underline' },
  card: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  hit: { fontWeight: '400' },
});

/** "This is unclear": the learner asks for the lesson to be written again, simpler, with another example, or shorter. */
export function RewriteRow({ show, onPick }: { show: boolean; onPick: (how: Rewrite) => void }) {
  const { colors } = useTheme();
  if (!show) return null;
  return (
    <View style={styles.row} testID="square-rewrite">
      <Text style={[styles.meta, { color: colors.textMuted }]}>This is unclear:</Text>
      <TouchableOpacity onPress={() => onPick('simpler')} testID="square-rewrite-simpler"><Text style={{ color: colors.primary }}>Simpler</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onPick('example')} testID="square-rewrite-example"><Text style={{ color: colors.primary }}>Another example</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onPick('shorter')} testID="square-rewrite-shorter"><Text style={{ color: colors.primary }}>Shorter</Text></TouchableOpacity>
    </View>
  );
}
