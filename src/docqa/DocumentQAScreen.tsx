import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { NavigationRouteContext } from '@react-navigation/native';
import { sharedName } from '../share/sharedFile';
import { documentService } from '../services/documentService';
import { answerQuestion, buildIndex, type Answer, type DocIndex } from './index';

/** The most characters read from a document (about 140 pages). */
const MAX_CHARS = 280000;

interface Asked { question: string; answer?: Answer; error?: string }

/** Ask questions of one long document: pick it, wait for it to be read once, then ask. The answer says which passages it came from, and they can be opened. */
export const DocumentQAScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const [doc, setDoc] = React.useState<{ name: string; text: string; index: DocIndex } | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState('');
  const [asked, setAsked] = React.useState<Asked[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);

  const openFile = async (uri: string, name: string) => {
    setProgress('Opening the document...'); setDoc(null); setAsked([]);
    const text = await documentService.textFromPicked(uri, name, MAX_CHARS);
    if (text.trim().length < 200) throw new Error('There is hardly any text in that file to ask about.');
    const index = await buildIndex(text, (done, total) => setProgress(`Reading the document: ${done} of ${total} passages...`));
    setDoc({ name, text, index });
  };
  const choose = async () => {
    setError(null);
    const { pick, types, isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
    try {
      const [file] = await pick({ type: [types.allFiles], mode: 'import', allowMultiSelection: false });
      if (!file) return;
      await openFile(file.uri, file.name ?? 'document.txt');
    } catch (e: any) {
      if (!(isErrorWithCode?.(e) && e.code === errorCodes.OPERATION_CANCELED)) setError(String(e?.message || e));
    }
    setProgress(null);
  };
  // A document shared into Atlas from another app opens at once.
  const shared = (React.useContext(NavigationRouteContext)?.params as { file?: { uri: string; mime: string } } | undefined)?.file;
  React.useEffect(() => {
    if (!shared) return;
    setError(null);
    openFile(shared.uri, sharedName(shared.mime)).catch((e) => setError(String(e?.message || e))).finally(() => setProgress(null));
  }, [shared?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async () => {
    const q = question.trim();
    if (!doc || !q || busy) return;
    setBusy(true); setQuestion('');
    try { const answer = await answerQuestion(q, doc); setAsked((a) => [{ question: q, answer }, ...a]); }
    catch (e: any) { setAsked((a) => [{ question: q, error: `The AI could not answer: ${String(e?.message || e).slice(0, 160)}` }, ...a]); }
    setBusy(false);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Ask a document" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
          Pick a long PDF or text file and ask it questions. The document is read once on this phone and kept only while this screen is open. Each answer says which passages it came from.
        </Text>
        <Button title={doc ? 'Choose another document' : 'Choose a document'} variant="outline" onPress={() => { void choose(); }} disabled={!!progress} testID="docqa-choose" />
        {!!progress && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="docqa-progress">{progress}</Text>}
        {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="docqa-error">{error}</Text>}
        {doc && (
          <>
            <Text style={{ color: colors.text, ...TYPOGRAPHY.h3 }} testID="docqa-name">{doc.name}</Text>
            <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>{doc.index.passages.length} passages ready.</Text>
            <TextInput value={question} onChangeText={setQuestion} multiline testID="docqa-question" placeholder="Ask something about it, or ask for a summary" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Button title={busy ? 'Looking...' : 'Ask'} onPress={() => { void ask(); }} disabled={busy || !question.trim()} testID="docqa-ask" />
          </>
        )}
        {asked.map((a, n) => (
          <View key={`${n}-${a.question}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`docqa-answer-${asked.length - 1 - n}`}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>{a.question.toUpperCase()}</Text>
            {!!a.answer && <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }}>{a.answer.text}</Text>}
            {!!a.error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }}>{a.error}</Text>}
            {!!a.answer && a.answer.whole && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>Written from notes on the whole document.</Text>}
            {!!a.answer?.from.length && (
              <View style={styles.chips}>
                <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }}>From passages</Text>
                {a.answer.from.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setOpen(open === `${n}-${p}` ? null : `${n}-${p}`)} style={[styles.chip, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Show passage ${p}`} testID={`docqa-passage-${asked.length - 1 - n}-${p}`}>
                    <Text style={{ color: colors.primary, ...TYPOGRAPHY.bodySmall }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {a.answer?.from.map((p) => open === `${n}-${p}` && doc && <Text key={`t${p}`} style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="docqa-passage-text">{`[${p}] ${doc.index.passages[p - 1]}`}</Text>)}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
  input: { ...TYPOGRAPHY.body, borderWidth: 1, borderRadius: SPACING.sm, padding: SPACING.md, minHeight: 72, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderRadius: SPACING.md, padding: SPACING.md, gap: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, minWidth: 36, alignItems: 'center' },
});
