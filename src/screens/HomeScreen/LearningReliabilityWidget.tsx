import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { learningKnowledgeDb, type ReliabilitySnapshot } from '../../learning/knowledgeDb';

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
    <View testID="home-learning-reliability-widget" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>Evidence & learning</Text>
      <Text style={{ color: colors.textSecondary, marginTop: 5, fontSize: 12 }}>{error || (data
        ? `${data.counts.candidate} awaiting review · ${data.counts.disputed} disputed · ${data.counts.verified} manually verified`
        : 'Reading evidence history...')}</Text>
      <TouchableOpacity testID="widget-learning-open" onPress={openLearning} style={{ marginTop: 9 }} accessibilityLabel="View learning reliability dashboard">
        <Text style={{ color: colors.primary }}>Review learning evidence</Text>
      </TouchableOpacity>
    </View>
  );
}
