import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { quotedSentence, lessonMarkdown, lessonText, spokenLesson, unbackedLines } from './citations';
import { writeDocx } from '../services/docxExport';
import { shareItem } from '../utils/shareItem';
import { appSearch, verdictText, verifyLines, type LineVerdict } from './verifyLines';
import { sourcePage } from './service';
import { missingTerms } from './gaps';
import { readAloud, useReadAloud } from '../atlasVoice/readAloud';
import { ttsAvailable } from '../atlasVoice/tts';
import type { SquareContent } from './formats';
import type { Rewrite } from './service';

interface Passage { source: string; url?: string; docId?: number; where?: string; text: string }

/**
 * Where a square came from: each source with its page, part or paragraph (a web page is a link; a page of your own book opens in full),
 * the passages, with the sentence the lesson leans on highlighted, and the lines no passage backs.
 */
export function CitedFold({ passages, content, projectId }: { passages: Passage[]; content?: SquareContent | null; projectId?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [page, setPage] = useState<{ key: string; text: string } | null>(null);
  const [verdicts, setVerdicts] = useState<LineVerdict[] | null>(null);
  const [checking, setChecking] = useState(false);
  const lesson = lessonText(content);
  const unbacked = unbackedLines(content, passages);
  const gaps = useMemo(() => (content?.kind === 'lesson' ? missingTerms(lesson, passages.map((p) => p.text)) : []), [content, passages]); // eslint-disable-line react-hooks/exhaustive-deps -- lesson follows content
  // A verdict belongs to the line it was made for: when the lesson is written again the lines change, so the old verdicts go.
  const lineKey = unbacked.join('\n');
  useEffect(() => { setVerdicts(null); }, [lineKey]);
  if (!passages.length) return null;
  const sources = passages.filter((p, i) => passages.findIndex((q) => q.source === p.source && q.where === p.where) === i);
  const label = (p: Passage) => `${p.source}${p.where ? `, ${p.where}` : ''}`;
  const check = async (lines: string[]) => { setChecking(true); try { setVerdicts(await verifyLines(lines, { projectId, search: appSearch() ?? undefined })); } finally { setChecking(false); } };
  const openPage = async (p: Passage) => {
    const key = label(p);
    if (page?.key === key) { setPage(null); return; }
    setPage({ key, text: p.docId != null ? (await sourcePage(p.docId, p.where)) || p.text : p.text });
  };
  return (
    <View testID="square-cited" style={styles.gap}>
      {/* Sources are there when wanted, and out of the way otherwise: one quiet line. */}
      <TouchableOpacity onPress={() => setShown((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: shown }} testID="square-sources-toggle">
        <Text style={[styles.meta, { color: colors.textMuted }]}>{shown ? 'Hide sources' : `Sources (${sources.length})`}</Text>
      </TouchableOpacity>
      {shown && <>
      {sources.map((p) => (p.url
        ? <Text key={label(p)} style={[styles.link, { color: colors.primary }]} accessibilityRole="link" onPress={() => Linking.openURL(p.url!)} testID="square-source-link">{label(p)}</Text>
        : <Text key={label(p)} style={[styles.link, { color: colors.primary }]} accessibilityRole="button" onPress={() => openPage(p)} testID="square-source-open">{label(p)}</Text>))}
      {!!page && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="square-source-page">
          <Text style={[styles.meta, { color: colors.textMuted }]}>{page.key}</Text>
          <Text style={{ color: colors.textSecondary }}>{page.text}</Text>
        </View>
      )}
      {gaps.length > 0 && <Text style={[styles.meta, { color: colors.textMuted }]} testID="square-gaps">Your sources stress these, but the lesson does not use them: {gaps.join(', ')}. A hint, not a mistake.</Text>}
      {unbacked.length > 0 && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="square-unbacked">
          <Text style={[styles.meta, { color: colors.textMuted }]}>Not found in your sources (from the AI's own knowledge, so check it)</Text>
          {unbacked.map((l, i) => (
            <View key={i}>
              <Text style={{ color: colors.textSecondary }}>{l}</Text>
              {!!verdicts?.[i] && <Text style={[styles.meta, { color: verdicts[i].status === 'unverified' || verdicts[i].status === 'offline' ? colors.error : colors.primary }]} testID={`line-verdict-${i}`}>{verdictText(verdicts[i])}</Text>}
            </View>
          ))}
          <TouchableOpacity onPress={() => check(unbacked)} disabled={checking} accessibilityRole="button" testID="square-check-lines"><Text style={{ color: colors.primary }}>{checking ? 'Checking...' : 'Check these lines'}</Text></TouchableOpacity>
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
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: SPACING.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.md },
  meta: { ...TYPOGRAPHY.bodySmall },
  link: { textDecorationLine: 'underline' },
  card: { borderWidth: 1, borderRadius: 8, padding: SPACING.md, gap: SPACING.xs },
  hit: { fontWeight: '400' },
});

/** "This is unclear": the learner asks for the lesson to be written again, simpler, with another example, or shorter. Also reads the lesson aloud in the voice chosen for Read aloud. */
export function RewriteRow({ show, onPick, content, title }: { show: boolean; onPick: (how: Rewrite) => void; content?: SquareContent | null; title?: string }) {
  const { colors } = useTheme();
  const reading = useReadAloud((s) => s.status === 'reading' && s.title === title);
  if (!show) return null;
  const saveWord = async () => {
    try { await shareItem({ title: title ?? 'Lesson', file: await writeDocx(title ?? 'Lesson', lessonMarkdown(content)) }); }
    catch (e: any) { Alert.alert('Could not save the Word document', String(e?.message || e)); }
  };
  const toggle = () => { if (reading) readAloud.stop(); else { readAloud.load(spokenLesson(content), title ?? 'Lesson'); readAloud.play(); } };
  return (
    <View style={styles.row} testID="square-rewrite">
      <Text style={[styles.meta, { color: colors.textMuted }]}>This is unclear:</Text>
      <TouchableOpacity onPress={() => onPick('simpler')} testID="square-rewrite-simpler"><Text style={{ color: colors.primary }}>Simpler</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onPick('example')} testID="square-rewrite-example"><Text style={{ color: colors.primary }}>Another example</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onPick('shorter')} testID="square-rewrite-shorter"><Text style={{ color: colors.primary }}>Shorter</Text></TouchableOpacity>
      {content?.kind === 'lesson' && (
        <TouchableOpacity onPress={() => { void saveWord(); }} accessibilityRole="button" accessibilityLabel="Save this lesson as a Word document" testID="square-save-word">
          <Text style={{ color: colors.primary }}>Save as Word</Text>
        </TouchableOpacity>
      )}
      {!!content && ttsAvailable() && (
        <TouchableOpacity onPress={toggle} accessibilityRole="button" accessibilityLabel={reading ? 'Stop reading this lesson' : 'Read this lesson aloud'} testID="square-read-aloud">
          <Text style={{ color: colors.primary }}>{reading ? 'Stop reading' : 'Read aloud'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
