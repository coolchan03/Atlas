import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { KIND_LABEL, unitsForLevel, type Unit } from './curriculum';
import { LEVELS, type LevelId } from './teaching';
import { LANGUAGES, MY_WORDS, REVIEW, languageService } from './languageService';
import { useLanguage } from './store';
import { createStyles } from './LanguageScreen.styles';

/** Board-game sideways steps for the path: each unit sits a little left or right of the last. */
const SWAY = [0, 50, 80, 50, 0, -50, -80, -50];

/**
 * Learn a language: four levels (Basic, Intermediate, Advanced, Fluent), each a board-game
 * path of vocabulary, grammar and theme units. Finish a unit's lesson to move your
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
  const level = useLanguage((s) => s.level);
  const hasWords = useLanguage((s) => (s.myWords[s.language]?.length ?? 0) >= 4);
  const due = languageService.dueCount(code);
  const levelUnits = unitsForLevel(level);
  // Words saved from stories and podcasts become a last stop of their own.
  const units: (Unit | { id: string; title: string; icon: string; kind?: undefined })[] =
    hasWords ? [...levelUnits, { id: MY_WORDS, title: 'My words', icon: 'star' }] : levelUnits;
  const current = levelUnits.find((u) => (progress[u.id]?.stars ?? 0) <= 0)?.id;
  const doneInLevel = levelUnits.filter((u) => (progress[u.id]?.stars ?? 0) > 0).length;

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
      <View style={styles.levels}>
        {LEVELS.map((l) => (
          <TouchableOpacity key={l.id} onPress={() => languageService.setLevel(l.id as LevelId)} accessibilityLabel={`Level ${l.id}, ${l.name}`}
            style={[styles.level, l.id === level && styles.levelOn]}>
            <Text style={l.id === level ? styles.levelTextOn : styles.levelText}>{l.id} {l.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.extras}>
        <Text style={styles.meta}>{doneInLevel} of {levelUnits.length} done · {LEVELS[level - 1].cefr}</Text>
        <TouchableOpacity disabled={!languageService.unlocked(REVIEW, code)} onPress={() => navigation.navigate('Lesson', { unitId: REVIEW })} testID="language-review">
          <Text style={languageService.unlocked(REVIEW, code) ? styles.extraOn : styles.extraOff}>Review ({due})</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={!doneInLevel} onPress={() => navigation.navigate('Lesson', { unitId: levelUnits.filter((u) => (progress[u.id]?.stars ?? 0) > 0).slice(-1)[0].id, mode: 'speed' })} testID="language-speed">
          <Text style={doneInLevel ? styles.extraOn : styles.extraOff}>Speed round</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.board} testID="language-board">
        {units.map((u, i) => {
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
              {!!u.kind && <Text style={styles.kind}>{KIND_LABEL[u.kind]}</Text>}
              {stars > 0 && (
                <View style={styles.stars}>
                  {[1, 2, 3].map((n) => <Icon key={n} name="star" size={12} color={n <= stars ? colors.primary : colors.border} />)}
                </View>
              )}
            </View>
          );
        })}
        <Text style={styles.note}>
          Already know some? Pick a higher level: the first unit of every level is open. Lessons are written once
          by the AI on your phone, following the course method, so wording may be imperfect. Health and help uses
          the phone's phrase cards. Everything works offline after that.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
