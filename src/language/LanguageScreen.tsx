import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { UNITS } from './curriculum';
import { LANGUAGES, languageService } from './languageService';
import { useLanguage } from './store';
import { createStyles } from './LanguageScreen.styles';

/** Board-game sideways steps for the path: each unit sits a little left or right of the last. */
const SWAY = [0, 50, 80, 50, 0, -50, -80, -50];

/**
 * Learn a language: a board-game path of topic units. Finish a unit's lesson to move your
 * token on and open the next one. Stars, XP and a daily streak show progress.
 */
export const LanguageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const code = useLanguage((s) => s.language);
  const progress = useLanguage((s) => s.progress[s.language]) ?? {};
  const xp = useLanguage((s) => s.xp);
  const streak = useLanguage((s) => s.streak.count);
  const current = UNITS.find((u) => (progress[u.id]?.stars ?? 0) <= 0)?.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Learn a language</Text>
        <View style={styles.stat} accessibilityLabel={`${streak} day streak`}>
          <Icon name="zap" size={16} color={colors.primary} /><Text style={styles.statText}>{streak}</Text>
        </View>
        <View style={styles.stat} accessibilityLabel={`${xp} XP`}>
          <Icon name="award" size={16} color={colors.primary} /><Text style={styles.statText}>{xp} XP</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langRow}>
        {LANGUAGES.map((l) => (
          <TouchableOpacity key={l.code} onPress={() => languageService.setLanguage(l.code)} style={[styles.chip, l.code === code && styles.chipOn]}>
            <Text style={l.code === code ? styles.chipTextOn : styles.chipText}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.board} testID="language-board">
        {UNITS.map((u, i) => {
          const stars = progress[u.id]?.stars ?? 0;
          const open = languageService.unlocked(u.id, code);
          const isCurrent = u.id === current;
          return (
            <View key={u.id} style={[styles.stop, { transform: [{ translateX: SWAY[i % SWAY.length] }] }]}>
              {i > 0 && <View style={[styles.link, stars > 0 && styles.linkDone]} />}
              <TouchableOpacity
                testID={`unit-${u.id}`}
                disabled={!open}
                onPress={() => navigation.navigate('Lesson', { unitId: u.id })}
                accessibilityLabel={`${u.title}${open ? '' : ', locked'}${stars ? `, ${stars} stars` : ''}`}
                style={[styles.node, stars > 0 && styles.nodeDone, isCurrent && styles.nodeCurrent, !open && styles.nodeLocked]}
              >
                <Icon name={open ? u.icon : 'lock'} size={26} color={stars > 0 ? colors.background : open ? colors.primary : colors.textMuted} />
                {isCurrent && open && <View style={styles.token}><Icon name="flag" size={18} color={colors.primary} /></View>}
              </TouchableOpacity>
              <Text style={styles.nodeNumber}>{i + 1}</Text>
              <Text style={styles.nodeTitle}>{u.title}</Text>
              {stars > 0 && (
                <View style={styles.stars}>
                  {[1, 2, 3].map((n) => <Icon key={n} name="star" size={12} color={n <= stars ? colors.primary : colors.border} />)}
                </View>
              )}
            </View>
          );
        })}
        <Text style={styles.note}>
          Health and help uses the phone's phrase cards. Other units are written once by the AI on your phone, so
          wording may be imperfect. Everything works offline after that.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
