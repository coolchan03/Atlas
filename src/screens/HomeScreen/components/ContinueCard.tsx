import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../../theme';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useLanguage } from '../../../language/store';
import { continueInfo } from '../../../language/continueInfo';
import { BRIEF_PROJECT, todayKey } from '../../../atlasTools/dailyBrief';
import { useStudyStore } from '../../../study/engine';

/**
 * "Pick up where you left off" for the two things Home does not already resume: your next Learn square and today's
 * briefing. (Recent chats above already have their own continue button.) Shows nothing when there is nothing to resume.
 */
export const ContinueCard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  useLanguage((s) => s.progress);
  useLanguage((s) => s.level);
  const next = continueInfo();
  const briefing = useStudyStore((s) => (s.saved[BRIEF_PROJECT] ?? []).find((r) => todayKey(new Date(r.createdAt)) === todayKey()));
  if (!next && !briefing) return null;
  const row = ({ icon, title, meta, onPress, testID }: { icon: string; title: string; meta: string; onPress: () => void; testID: string }) => (
    <AnimatedPressable key={testID} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={onPress} hapticType="selection" testID={testID}>
      <Icon name={icon} size={18} color={colors.primary} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{meta}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.textMuted} />
    </AnimatedPressable>
  );
  return (
    <View style={styles.wrap} testID="home-continue">
      {!!next && row({ icon: 'book', title: `Continue ${next.language}: ${next.title}`, meta: 'Next square on your board', onPress: () => navigation.navigate('Language'), testID: 'home-continue-learn' })}
      {!!briefing && row({ icon: 'headphones', title: "Listen to today's briefing", meta: briefing.title ?? 'Daily briefing', onPress: () => navigation.navigate('Study', { projectId: BRIEF_PROJECT, openAt: briefing.createdAt }), testID: 'home-continue-briefing' })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  text: { flex: 1 },
  title: { fontSize: 15 },
  meta: { fontSize: 12, marginTop: 2 },
});
