import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { documentService } from '../../services/documentService';
import { addImportedQuestions } from '../../learning/importService';
import { divide, normalizeQuestions, type ImportTarget, type NormalizedQuestion } from '../../learning/questionImport';
import { parseQuestionTable } from '../../learning/questionTable';
import { sectionStyles as s } from './sectionStyles';

const TARGETS: Array<{ id: ImportTarget; label: string; note: string }> = [
  { id: 'study', label: 'Study them', note: 'The learner researches each question and writes reports.' },
  { id: 'exam', label: 'Exam only', note: 'Never studied: they measure how well it learned.' },
  { id: 'split', label: 'Split', note: 'Every fourth question is held back for the exam, the rest are studied.' },
];

const keyFor = (q: NormalizedQuestion) => q.question;

/** Paste or choose a test; the AI reads it into questions with answers; check them, then add them to this subject. */
/** `onConfirm` sends the questions somewhere else (an exam's practice bank) and returns what to tell the person; `topics` lets the AI file each question under one. */
export const QuestionImport: React.FC<{ subjectId?: string; onAdded: () => void; topics?: string[]; onConfirm?: (items: NormalizedQuestion[]) => string }> = ({ subjectId = '', onAdded, topics, onConfirm }) => {
  const { colors } = useTheme();
  const [source, setSource] = useState('');
  const [found, setFound] = useState<NormalizedQuestion[] | null>(null);
  const [target, setTarget] = useState<ImportTarget>('study');
  const [busy, setBusy] = useState(false);

  const read = async () => {
    setBusy(true);
    try {
      const ask = (system: string, user: string) => require('../../study/engine').askModel(system, user);
      // A table (CSV or tab-separated) is read in code, with no AI and no size limit.
      const items = parseQuestionTable(source) ?? await normalizeQuestions(source, ask, topics);
      if (!items.length) Alert.alert('No questions found', 'The AI could not find questions with answers in that text. Each question needs its answer written next to it.');
      setFound(items.length ? items : null);
    } catch (e: any) { Alert.alert('Could not read the questions', String(e?.message || e)); } finally { setBusy(false); }
  };
  const chooseFile = async () => {
    const { pick, types, isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
    try {
      const [file] = await pick({ type: [types.allFiles], mode: 'import', allowMultiSelection: false });
      if (file) setSource(await documentService.textFromPicked(file.uri, file.name ?? 'questions.txt', /\.(csv|tsv)$/i.test(file.name ?? '') ? 2000000 : 60000));
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) Alert.alert('Could not open that file', String(e?.message || e));
    }
  };
  const add = () => {
    if (!found) return;
    if (onConfirm) { Alert.alert('Added', onConfirm(found)); setFound(null); setSource(''); onAdded(); return; }
    const outcome = addImportedQuestions(subjectId, found, target);
    Alert.alert('Added', `${outcome.study} to study, ${outcome.exam} to the exam${outcome.repeats ? `, ${outcome.repeats} skipped because they were already there` : ''}.`);
    setFound(null); setSource(''); onAdded();
  };
  const split = found ? divide(found, target) : null;

  return (
    <View style={[s.card, { borderColor: colors.border }]} testID="question-import">
      <Text style={[s.title, { color: colors.text }]}>{onConfirm ? 'Add a question bank or quiz' : 'Add your own questions'}</Text>
      <Text style={[s.note, { color: colors.textSecondary }]}>Paste a test, quiz or exam paper in any layout, or choose a file. The AI puts it in one standard form. You check the questions and answers before anything is added.</Text>
      <TextInput testID="import-source" value={source} onChangeText={setSource} multiline placeholder={'1. What is the boiling point of water at sea level?\nAnswer: 100 C\n\n2. Which is a noble gas? a) Oxygen b) Neon c) Iron\nAnswer: b'} placeholderTextColor={colors.textMuted}
        style={[s.input, s.multiline, { color: colors.text, borderColor: colors.border }]} />
      <View style={s.row}>
        <TouchableOpacity onPress={chooseFile} style={[s.button, { borderColor: colors.border }]} accessibilityRole="button"><Text style={{ color: colors.text }}>Choose a file</Text></TouchableOpacity>
        <TouchableOpacity onPress={read} disabled={busy || source.trim().length < 15} style={[s.button, { borderColor: busy || source.trim().length < 15 ? colors.border : colors.primary }]} accessibilityRole="button" testID="import-read">
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: source.trim().length < 15 ? colors.textMuted : colors.primary }}>Read the questions</Text>}
        </TouchableOpacity>
      </View>
      {found && (
        <View testID="import-review">
          <Text style={[s.title, { color: colors.text }]}>{found.length} question{found.length === 1 ? '' : 's'} found</Text>
          {found.map((q) => (
            <View key={keyFor(q)} style={s.row}>
              <View style={s.grow}>
                <Text style={{ color: colors.text }}>{q.question}</Text>
                <Text style={[s.small, { color: colors.textSecondary }]}>{q.options ? `Choices: ${q.options.join(' / ')}. ` : ''}Answer: {q.answer}</Text>
              </View>
              <TouchableOpacity onPress={() => setFound((f) => (f ? f.filter((x) => x !== q) : f))} accessibilityLabel={`Remove ${q.question}`}><Text style={{ color: colors.error }}>Remove</Text></TouchableOpacity>
            </View>
          ))}
          {!onConfirm && <View style={s.row}>
            {TARGETS.map((t) => (
              <TouchableOpacity key={t.id} onPress={() => setTarget(t.id)} accessibilityRole="radio" accessibilityState={{ selected: target === t.id }} testID={`import-target-${t.id}`}
                style={[s.chip, { borderColor: target === t.id ? colors.primary : colors.border, backgroundColor: target === t.id ? colors.primary : colors.surface }]}>
                <Text style={{ color: target === t.id ? colors.background : colors.text }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>}
          {!onConfirm && <Text style={[s.small, { color: colors.textSecondary }]}>{TARGETS.find((t) => t.id === target)!.note} {split ? `${split.study.length} to study, ${split.exam.length} to the exam.` : ''}</Text>}
          <TouchableOpacity onPress={add} disabled={!found.length} style={[s.button, { borderColor: colors.primary }]} accessibilityRole="button" testID="import-add"><Text style={{ color: colors.primary }}>{onConfirm ? 'Add to practice' : 'Add to this subject'}</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
};
