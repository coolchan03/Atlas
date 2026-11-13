import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Card } from '../components';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useAppStore, useChatStore } from '../stores';
import { useAskLater } from './askLater';
import type { Course } from './store';

/** Write or say a question while studying and keep it on the course; ask the tutor any of them later with the course's books. */
export function AskLaterCard({ course }: { course: Course }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const all = useAskLater((s) => s.questions);
  const { add, remove } = useAskLater.getState();
  const [text, setText] = useState('');
  const voice = useVoiceRecording();
  const mine = all.filter((q) => q.courseId === course.id);
  // What was said is added to the box, to check or fix before it is saved.
  useEffect(() => { if (voice.finalResult) { setText((t) => `${t} ${voice.finalResult}`.trim()); voice.clearResult(); } }, [voice.finalResult]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => { if (add(course.id, text)) setText(''); };
  const ask = (question: string) => {
    const app = useAppStore.getState();
    const modelId = app.activeModelId ?? app.downloadedModels[0]?.id;
    if (!modelId) { Alert.alert('No model', 'Download or pick a text model first.'); return; }
    const id = useChatStore.getState().createConversation(modelId, `${course.title}: a question`, course.projectId);
    navigation.navigate('Chat', { conversationId: id, ...(course.projectId ? { projectId: course.projectId } : {}), starter: `On the course "${course.title}": ${question}` });
  };
  return (
    <Card style={styles.card} testID="ask-later">
      <Text style={[styles.title, { color: colors.text }]}>Questions to ask later</Text>
      <View style={styles.row}>
        <TextInput value={text} onChangeText={setText} placeholder="A question that came up" placeholderTextColor={colors.textMuted} testID="ask-later-input" multiline
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        {voice.isAvailable && (
          <TouchableOpacity onPress={() => (voice.isRecording ? voice.stopRecording() : voice.startRecording())} accessibilityRole="button" accessibilityLabel={voice.isRecording ? 'Stop listening' : 'Say a question'} testID="ask-later-mic">
            <Icon name={voice.isRecording ? 'mic-off' : 'mic'} size={22} color={voice.isRecording ? colors.error : colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={save} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Save the question" testID="ask-later-save">
          <Icon name="plus-circle" size={24} color={text.trim() ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
      </View>
      {!!voice.partialResult && <Text style={[styles.small, { color: colors.textSecondary }]}>{voice.partialResult}</Text>}
      {mine.map((q) => (
        <View key={q.id} style={styles.row} testID={`ask-later-${q.id}`}>
          <Text style={[styles.grow, { color: colors.text }]}>{q.text}</Text>
          <TouchableOpacity onPress={() => ask(q.text)} accessibilityRole="button" accessibilityLabel={`Ask the tutor: ${q.text}`} testID={`ask-later-ask-${q.id}`}><Text style={{ color: colors.primary }}>Ask</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => remove(q.id)} accessibilityRole="button" accessibilityLabel="Remove the question"><Icon name="x" size={16} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ))}
      {!mine.length && <Text style={[styles.small, { color: colors.textSecondary }]}>Nothing saved yet. Write or say a question and it waits here for the tutor.</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: SPACING.sm },
  title: { ...TYPOGRAPHY.h3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginVertical: SPACING.xs },
  grow: { flex: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, minHeight: 40 },
  small: { ...TYPOGRAPHY.bodySmall },
});
