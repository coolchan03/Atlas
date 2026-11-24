import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button } from '../components/Button';
import { useWideLayout } from '../hooks/useWideLayout';
import { answerFromPassages, indexPassages, type Answer, type DocIndex } from '../docqa';
import { collectNotes, type NotePassage } from './corpus';

/** Passage vectors kept while the app runs, so asking again does not read every note again. */
const known = new Map<string, number[] | null>();

interface Asked { question: string; answer?: Answer; error?: string }

/** Ask your own notes: journal, chats, recordings and trips. Each answer says which of them it came from. */
export const AskNotesScreen: React.FC = () => {
  const { colors } = useTheme();
  const wide = useWideLayout(760);
  const [notes, setNotes] = React.useState<{ passages: NotePassage[]; index: DocIndex } | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState('');
  const [asked, setAsked] = React.useState<Asked[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);

  const load = async () => {
    setError(null); setAsked([]);
    const passages = collectNotes();
    if (!passages.length) { setNotes(null); setError('There is nothing to ask yet: write a journal page, have a chat or make a recording first.'); return; }
    setProgress('Reading your notes...');
    try {
      const index = await indexPassages(passages.map((p) => p.text), (d, t) => setProgress(`Reading your notes: ${d} of ${t}...`), known);
      setNotes({ passages, index });
    } catch (e) { setError(String((e as Error)?.message || e)); }
    setProgress(null);
  };
  React.useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async () => {
    const q = question.trim();
    if (!notes || !q || busy) return;
    setBusy(true); setQuestion('');
    try {
      const answer = await answerFromPassages(q, notes.index, { labelOf: (i) => notes.passages[i].source, none: 'I could not find anything about that in your notes.', task: 'Answering from your notes' });
      setAsked((a) => [{ question: q, answer }, ...a]);
    } catch (e) { setAsked((a) => [{ question: q, error: `The AI could not answer: ${String((e as Error)?.message || e).slice(0, 160)}` }, ...a]); }
    setBusy(false);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Ask my notes" />
      <ScrollView contentContainerStyle={[styles.body, wide.column]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }}>
          Ask about what you have written and said: journal pages, chats, recordings and trips. Private chats are left out. Everything is read on this phone, and each answer names where it came from.
        </Text>
        {!!progress && <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="notes-progress">{progress}</Text>}
        {!!error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }} testID="notes-error">{error}</Text>}
        {notes && (
          <>
            <Text style={{ color: colors.textMuted, ...TYPOGRAPHY.bodySmall }} testID="notes-count">{notes.passages.length} passages ready.</Text>
            <TextInput value={question} onChangeText={setQuestion} multiline testID="notes-question" placeholder="What did I decide about the trip? When did I last feel stressed?" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Button title={busy ? 'Looking...' : 'Ask'} onPress={() => { void ask(); }} disabled={busy || !question.trim()} testID="notes-ask" />
          </>
        )}
        <Button title="Read my notes again" variant="outline" onPress={() => { void load(); }} disabled={!!progress} testID="notes-reload" />
        {asked.map((a, n) => (
          <View key={`${n}-${a.question}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`notes-answer-${asked.length - 1 - n}`}>
            <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.meta }}>{a.question.toUpperCase()}</Text>
            {!!a.answer && <Text selectable style={{ color: colors.text, ...TYPOGRAPHY.body }}>{a.answer.text}</Text>}
            {!!a.error && <Text style={{ color: colors.error, ...TYPOGRAPHY.bodySmall }}>{a.error}</Text>}
            {!!a.answer?.from.length && a.answer.from.map((p) => (
              <TouchableOpacity key={p} onPress={() => setOpen(open === `${n}-${p}` ? null : `${n}-${p}`)} accessibilityRole="button" testID={`notes-source-${asked.length - 1 - n}-${p}`}>
                <Text style={{ color: colors.primary, ...TYPOGRAPHY.bodySmall }}>{`[${p}] ${notes?.passages[p - 1].source ?? ''}`}</Text>
                {open === `${n}-${p}` && <Text style={{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }} testID="notes-source-text">{notes?.passages[p - 1].text}</Text>}
              </TouchableOpacity>
            ))}
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
});
