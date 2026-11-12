import React, { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { learningKnowledgeDb, type OpenContradiction } from '../../learning/knowledgeDb';
import { MasteryStore, type MasterySummary } from '../../learning/masteryStore';
import { exams } from '../../learning/engine';
import { improvementSummary } from '../../learning/exams';
import { sectionStyles as s } from './sectionStyles';

const mastery = new MasteryStore(learningKnowledgeDb);
const per = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

interface Progress {
  mastery: MasterySummary;
  rate: { verified: number; hours: number; perHour: number };
  conflicts: OpenContradiction[];
  improvement: string;
}

function load(): Progress {
  return {
    mastery: mastery.summary(null), rate: learningKnowledgeDb.verificationRate(),
    conflicts: learningKnowledgeDb.openContradictions(5), improvement: improvementSummary(exams.history(40)),
  };
}

/** What has been learned and how well it is kept: review progress, conflicts to settle, and the measured effect of memory. */
export const ProgressSection: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const { colors } = useTheme();
  const [data, setData] = useState<Progress | null>(null);
  const [problem, setProblem] = useState('');
  useFocusEffect(useCallback(() => {
    try { setData(load()); setProblem(''); } catch (e: any) { setProblem(String(e?.message || e)); }
  }, [refreshKey])); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = (c: OpenContradiction) => Alert.alert('Mark this conflict as resolved?', 'Do this after you reviewed both claims below. It records that you settled it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Resolved', onPress: () => { learningKnowledgeDb.resolveContradiction(c.id, 'Settled by the device owner after review'); onChanged(); } },
  ]);
  if (problem) return <Text style={[s.note, { color: colors.error }]}>{problem}</Text>;
  if (!data) return null;
  return (
    <View testID="learning-progress">
      <View style={[s.card, { borderColor: colors.border }]}>
        <Text style={[s.title, { color: colors.text }]}>How well it is kept</Text>
        <Text style={[s.note, { color: colors.textSecondary }]}>
          {data.mastery.tracked} topics tracked, {data.mastery.due} due for review, {data.mastery.mastered} well remembered.
          {data.rate.verified ? ` You verified ${data.rate.verified} claims, about ${per(data.rate.perHour)} per hour since learning began.` : ' No claim has been verified by you yet.'}
        </Text>
        <Text style={[s.note, { color: colors.textSecondary }]} testID="learning-improvement">{data.improvement}</Text>
        <Text style={[s.small, { color: colors.textMuted }]}>Model weights: unchanged. Atlas has not trained any model. What it learned is stored as claims in a database, which is what the numbers above measure.</Text>
      </View>
      {data.conflicts.map((c) => (
        <View key={c.id} style={[s.card, { borderColor: colors.error }]} testID={`conflict-${c.id}`}>
          <Text style={[s.title, { color: colors.text }]}>Two claims disagree</Text>
          <Text style={[s.note, { color: colors.textSecondary }]}>{c.reason}</Text>
          <Text style={[s.note, { color: colors.text }]}>A: {c.a.text}</Text>
          <Text style={[s.note, { color: colors.text }]}>B: {c.b.text}</Text>
          <TouchableOpacity onPress={() => resolve(c)} accessibilityRole="button" accessibilityLabel="Mark conflict resolved"><Text style={{ color: colors.primary }}>Mark as resolved</Text></TouchableOpacity>
        </View>
      ))}
    </View>
  );
};
