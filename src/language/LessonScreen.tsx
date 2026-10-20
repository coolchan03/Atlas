import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { unitById } from './curriculum';
import { LANGUAGES, languageService } from './languageService';
import { buildLesson, sameAnswer, type Exercise } from './lessons';
import { useLanguage } from './store';
import { ExerciseView, type Attempt } from './Exercises';
import { createStyles } from './LessonScreen.styles';

const EMPTY: Attempt = { value: '', checked: false };

/** One lesson of a unit: about ten short exercises, then stars, XP and the streak. */
export const LessonScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { unitId } = useRoute<any>().params as { unitId: string };
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const code = useLanguage((s) => s.language);
  const langName = LANGUAGES.find((l) => l.code === code)?.name ?? code;
  const unit = unitById(unitId)!;
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [step, setStep] = useState('Getting the words ready...');
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [attempt, setAttempt] = useState<Attempt>(EMPTY);
  const [result, setResult] = useState<{ stars: number; xp: number; streak: number } | null>(null);

  const start = () => {
    setError(null); setExercises(null); setI(0); setRight(0); setAttempt(EMPTY); setResult(null);
    languageService.unitWords(unitId, setStep)
      .then((items) => setExercises(buildLesson(items)))
      .catch((e) => setError(String(e?.message || e)));
  };
  useEffect(start, [unitId, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = exercises?.[i];
  const correct = !!ex && ex.kind !== 'match' && sameAnswer(attempt.value, ex.answer);
  const next = (gotIt: boolean) => {
    const score = right + (gotIt ? 1 : 0);
    setRight(score);
    setAttempt(EMPTY);
    if (i + 1 < (exercises?.length ?? 0)) { setI(i + 1); return; }
    setResult(languageService.finishLesson(unitId, score, exercises!.length));
  };
  const rewrite = () => Alert.alert('Write these words again?', 'The AI on your phone writes this unit\'s words again, for a wording that looks wrong.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Rewrite', onPress: () => { languageService.rewrite(unitId); start(); } },
  ]);

  if (error || !exercises) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          {error ? <Text style={styles.feedback}>{error}</Text> : <><ActivityIndicator color={colors.primary} /><Text style={styles.meta}>{step}</Text></>}
          {!!error && <Button title="Try again" onPress={start} />}
          <Button title="Back" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center} testID="lesson-done">
          <Text style={styles.big}>{unit.title} done</Text>
          <View style={styles.starsRow}>{[1, 2, 3].map((n) => <Icon key={n} name="star" size={36} color={n <= result.stars ? colors.primary : colors.border} />)}</View>
          <Text style={styles.feedback}>{right} of {exercises.length} right · +{result.xp} XP · {result.streak} day streak</Text>
          <Button title="Back to the board" onPress={() => navigation.goBack()} testID="lesson-back" />
          <Button title="Practice again" variant="outline" onPress={start} />
          {languageService.isAiMade(unitId) && (
            <TouchableOpacity onPress={rewrite}><Text style={styles.meta}>Words written by the AI on your phone. Wording looks wrong? Rewrite them.</Text></TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Leave lesson"><Icon name="x" size={22} color={colors.text} /></TouchableOpacity>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${(i / exercises.length) * 100}%` }]} /></View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <ExerciseView key={i} ex={ex!} lang={code} langName={langName} attempt={attempt}
          onPick={(value) => setAttempt({ value, checked: false })} onMatched={(mistakes) => next(mistakes <= 1)} />
      </ScrollView>
      {ex!.kind !== 'match' && (
        <View style={styles.footer}>
          {attempt.checked && (
            <Text style={styles.feedback} testID="lesson-feedback">
              {correct ? 'Right.' : `Not quite. Answer: ${ex!.answer}`}
            </Text>
          )}
          {attempt.checked
            ? <Button title="Continue" onPress={() => next(correct)} testID="lesson-continue" />
            : <Button title="Check" disabled={!attempt.value} onPress={() => setAttempt({ ...attempt, checked: true })} testID="lesson-check" />}
        </View>
      )}
    </SafeAreaView>
  );
};
