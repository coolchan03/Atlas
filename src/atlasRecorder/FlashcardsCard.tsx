import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { Button, Card } from '../components';
import { useProjectStore } from '../stores';
import { cardsFromTranscript, splitForCards, MAX_CHUNKS } from '../study/bulkCards';
import { useStudyStore } from '../study/engine';
import type { Recording } from './store';

/** Turns the whole transcript (a lecture, a talk) into a deck of flashcards in a project, one passage at a time, keeping only cards the passage supports. */
export const FlashcardsCard: React.FC<{ rec: Recording }> = ({ rec }) => {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const projects = useProjectStore((s) => s.projects);
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState('');
  const stop = useRef(false);
  const text = (rec.utterances ?? []).map((u) => u.text).join(' ');
  if (!text.trim()) return null;
  const passages = splitForCards(text).length;

  const make = async (projectId: string) => {
    setChoosing(false); setNote(''); stop.current = false; setProgress('Starting');
    try {
      const { result, cut } = await cardsFromTranscript(text, rec.title, { onProgress: (d, t) => setProgress(`Passage ${d} of ${t}`), stopped: () => stop.current });
      useStudyStore.getState().add(projectId, result);
      setNote(`${result.cards?.length ?? 0} flashcards made${cut ? ` from the first ${MAX_CHUNKS} passages` : ''}.`);
      navigation.navigate('Study', { projectId, openAt: result.createdAt });
    } catch (e) { setNote((e as Error)?.message || 'Could not make the flashcards'); }
    finally { setProgress(''); }
  };
  const inNewProject = () => {
    const p = useProjectStore.getState().createProject({ name: rec.title.slice(0, 60) || 'Recording', description: 'Made from a recording.', systemPrompt: '', icon: '#10B981' } as never);
    void make(p.id);
  };

  return (
    <Card title="Flashcards" subtitle={`About ${passages} passage${passages === 1 ? '' : 's'} to read. A card is kept only when its answer is in the passage it came from.`} testID="recording-flashcards">
      {progress ? (
        <View style={styles.row}>
          <Text style={[styles.meta, { color: colors.textSecondary }]} testID="flashcards-progress">{progress}</Text>
          <Button title="Stop and keep what is made" size="small" variant="outline" onPress={() => { stop.current = true; }} testID="flashcards-stop" />
        </View>
      ) : (
        <Button title="Make flashcards" size="small" variant="outline" onPress={() => setChoosing(!choosing)} testID="flashcards-make" />
      )}
      {choosing && !progress && (
        <View style={styles.chips}>
          <TouchableOpacity onPress={inNewProject} style={[styles.chip, { borderColor: colors.primary }]} testID="flashcards-new-project"><Text style={{ color: colors.primary }}>New project</Text></TouchableOpacity>
          {projects.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => { void make(p.id); }} style={[styles.chip, { borderColor: colors.border }]} testID={`flashcards-in-${p.id}`}><Text style={{ color: colors.text }}>{p.name}</Text></TouchableOpacity>
          ))}
        </View>
      )}
      {!!note && <Text style={[styles.meta, { color: colors.textSecondary }]} testID="flashcards-note">{note}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { gap: SPACING.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: SPACING.sm, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
  meta: { ...TYPOGRAPHY.bodySmall },
});
