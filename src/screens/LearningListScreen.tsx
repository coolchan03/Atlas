import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { Card } from '../components';
import { NO_AGENT } from '../learning/agents';
import { defaultLearnConfig, useLearningStore } from '../learning/store';
import { isLearning } from '../learning/engine';

/** Teach the AI, as a list of subjects like Projects: each is a card that opens its own page. */
export const LearningListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const experts = useLearningStore((s) => s.experts);
  const state = useLearningStore((s) => s.state);
  const config = useLearningStore((s) => s.config);
  const addExpert = useLearningStore((s) => s.addExpert);
  const [name, setName] = useState('');
  const subjects = [{ id: NO_AGENT, name: 'General' }, ...experts];
  const learning = isLearning();

  const add = () => {
    if (!name.trim()) return;
    const id = addExpert(name);
    setName('');
    navigation.navigate('Learning', { agentId: id });
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenBackground screenKey="Learning" />
      <ScreenHeader title="Teach the AI" right={
        <TouchableOpacity onPress={() => navigation.navigate('LearningReliability')} accessibilityLabel="Learning reliability: evidence, mistakes and review" testID="learning-reliability-dashboard">
          <Icon name="check-square" size={20} color={colors.text} />
        </TouchableOpacity>
      } />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Each subject learns on its own, so one never blurs into another. Open a subject to set its task and sources, run it and read what it learned. A chat uses the lessons of the subject it is about.
        </Text>
        {learning && <Text style={[styles.note, { color: colors.primary }]} testID="learning-running">Learning is running now.</Text>}
        {subjects.map((subject) => {
          const st = state[subject.id];
          const cfg = { ...defaultLearnConfig(), ...(config[subject.id] || {}) };
          const reports = st?.totalReports ?? 0;
          return (
            <TouchableOpacity key={subject.id} onPress={() => navigation.navigate('Learning', { agentId: subject.id })} testID={`subject-${subject.id}`} accessibilityRole="button">
              <Card style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={[styles.name, { color: colors.text }]}>{subject.name}</Text>
                  <Icon name="chevron-right" size={18} color={colors.textMuted} />
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>{cfg.topic.trim() || 'No task yet. Open it to describe what to become an expert at.'}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Round {st?.round ?? 0} · {reports} {reports === 1 ? 'report' : 'reports'}</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
        {experts.length === 0 && <Text style={[styles.note, { color: colors.textSecondary }]} testID="no-experts-hint">No subjects yet besides General. Type one below (Taxes, Law, Psychology) so the AI learns one field at a time.</Text>}
        <View style={styles.row}>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={name} onChangeText={setName}
            placeholder="New subject, e.g. Taxes, Law, Psychology" placeholderTextColor={colors.textMuted} testID="new-expert-input" onSubmitEditing={add} />
          <TouchableOpacity onPress={add} disabled={!name.trim()} style={[styles.add, { borderColor: colors.primary }, !name.trim() && styles.dim]} testID="new-expert-add" accessibilityRole="button">
            <Text style={{ color: colors.primary }}>Add subject</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: SPACING.lg, paddingBottom: 80 },
  note: { ...TYPOGRAPHY.bodySmall, marginBottom: SPACING.md },
  card: { marginBottom: SPACING.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...TYPOGRAPHY.h3 },
  meta: { ...TYPOGRAPHY.bodySmall, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  add: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  dim: { opacity: 0.5 },
});
