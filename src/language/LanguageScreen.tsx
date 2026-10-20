import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { LEVELS, type LevelId } from './teaching';
import { LANGUAGES, MY_WORDS, REVIEW, languageService } from './languageService';
import { boardFor, spaceOpen, type Space } from './board';
import { unitsForLevel } from './curriculum';
import { useLanguage } from './store';
import { Board } from './Board';
import { createStyles } from './LanguageScreen.styles';

/**
 * Learn a language: four levels (Basic, Intermediate, Advanced, Fluent), each a board game.
 * Every square is one sitting of about five minutes: a lesson, or a story, podcast, speed
 * round or word search the pawn lands on. Finish a square to move on. Progress is saved.
 */
export const LanguageScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const code = useLanguage((s) => s.language);
  useLanguage((s) => s.progress[s.language]); // re-render when progress changes
  const xp = useLanguage((s) => s.xp);
  const streak = useLanguage((s) => s.streak.count);
  const level = useLanguage((s) => s.level);
  const sounds = useLanguage((s) => s.sounds);
  const due = languageService.dueCount(code);
  const spaces = boardFor(level);
  const isDone = (key: string) => languageService.isDone(key, code);
  const isOpen = (i: number) => spaceOpen(spaces, i, isDone);
  const firstOpen = spaces.findIndex((s, i) => !isDone(s.key) && isOpen(i));
  const current = firstOpen >= 0 ? firstOpen : spaces.length - 1;
  const doneCount = spaces.filter((s) => isDone(s.key)).length;

  const play = (s: Space, i: number) => {
    if (s.kind === 'lesson') navigation.navigate('Lesson', { unitId: s.unitId, part: s.part, parts: s.parts, key: s.key });
    else if (s.kind === 'story' || s.kind === 'podcast') navigation.navigate('Listening', { kind: s.kind, space: s.key, level, index: i });
    else {
      // Speed rounds and word searches use the lessons just before them on the board.
      const before = spaces.slice(0, i).filter((x) => x.kind === 'lesson').map((x) => x.unitId!);
      const unitId = before[before.length - 1] ?? unitsForLevel(level)[0].id;
      navigation.navigate(s.kind === 'speed' ? 'Lesson' : 'WordSearch', { unitId, mode: s.kind === 'speed' ? 'speed' : undefined, key: s.key });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Learn a language</Text>
        <View style={styles.stat} accessibilityLabel={`${streak} day streak`}>
          <Icon name="zap" size={16} color={colors.primary} /><Text style={styles.statText}>{streak}</Text>
        </View>
        <View style={styles.stat} accessibilityLabel={`${xp} XP`}>
          <Icon name="award" size={16} color={colors.primary} /><Text style={styles.statText}>{xp} XP</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langRow}>
          {LANGUAGES.map((l) => (
            <TouchableOpacity key={l.code} onPress={() => languageService.setLanguage(l.code)} style={[styles.chip, l.code === code && styles.chipOn]}>
              <Text style={l.code === code ? styles.chipTextOn : styles.chipText}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.levels}>
          {LEVELS.map((l) => (
            <TouchableOpacity key={l.id} onPress={() => languageService.setLevel(l.id as LevelId)} accessibilityLabel={`${l.cefr}, ${l.name}`}
              style={[styles.level, l.id === level && styles.levelOn]}>
              <Text style={l.id === level ? styles.levelTextOn : styles.levelText}>{l.cefr}</Text>
              <Text style={l.id === level ? styles.levelSubOn : styles.levelSub} numberOfLines={2}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.extras}>
          <Text style={styles.progressText}>Square {Math.min(current + 1, spaces.length)} of {spaces.length} · {doneCount} done</Text>
          <TouchableOpacity disabled={!languageService.unlocked(REVIEW, code)} onPress={() => navigation.navigate('Lesson', { unitId: REVIEW })} testID="language-review">
            <Text style={languageService.unlocked(REVIEW, code) ? styles.extraOn : styles.extraOff}>Review ({due})</Text>
          </TouchableOpacity>
          {languageService.unlocked(MY_WORDS, code) && (
            <TouchableOpacity onPress={() => navigation.navigate('Lesson', { unitId: MY_WORDS })} testID="language-mywords">
              <Text style={styles.extraOn}>My words</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => languageService.setSounds(!sounds)} testID="language-sounds"
            accessibilityLabel={sounds ? 'Sounds on' : 'Sounds off'}>
            <Icon name={sounds ? 'volume-2' : 'volume-x'} size={18} color={sounds ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Board spaces={spaces} isDone={isDone} isOpen={isOpen} current={current} onPress={play} />
        <Text style={styles.note}>
          Already know some? Pick a higher level: the first square of every level is open. Lessons are written once
          by the AI on your phone, following the course method, so wording may be imperfect. Everything works
          offline after that, and your progress is saved (and included in Atlas backups).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
