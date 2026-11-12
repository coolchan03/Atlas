import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { learningKnowledgeDb, type ReliabilitySnapshot } from '../../learning/knowledgeDb';
import { widgetStyles as w } from './widgetStyles';

/** Counts read from the evidence ledger. Never convert an AI judge pass into verification. */
export function LearningReliabilityWidget({ openLearning }: { openLearning: () => void }) {
  const { colors } = useTheme();
  const [data, setData] = useState<ReliabilitySnapshot | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    try { setData(learningKnowledgeDb.getReliabilitySnapshot()); setError(''); }
    catch { setError('Learning database not ready'); }
  }, []));
  return (
    <View testID="home-learning-reliability-widget" style={[w.card, { borderColor: colors.border }]}>
      <Text style={[w.title, { color: colors.text }]}>Evidence & learning</Text>
      <Text style={[w.detail, { color: colors.textSecondary }]}>{error || (data
        ? `${data.counts.candidate} awaiting review · ${data.counts.disputed} disputed · ${data.counts.verified} manually verified`
        : 'Reading evidence history...')}</Text>
      <TouchableOpacity testID="widget-learning-open" onPress={openLearning} style={w.link} accessibilityLabel="View learning reliability dashboard">
        <Text style={{ color: colors.primary }}>Review learning evidence</Text>
      </TouchableOpacity>
    </View>
  );
}
