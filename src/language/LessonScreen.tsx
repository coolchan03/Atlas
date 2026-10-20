import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { unitById } from './curriculum';
import { LANGUAGES, MY_WORDS, REVIEW, languageService } from './languageService';
import { levelGuide } from './teaching';
import { buildLesson, checkTyped, type Exercise } from './lessons';
import { useLanguage } from './store';
import { ExerciseView, type Attempt } from './Exercises';
import { createStyles } from './LessonScreen.styles';

const EMPTY: Attempt = { value: '', checked: false };

const SPEED_SECONDS = 60;

const lessonTitle = (unitId: string, speed: boolean) =>
  (speed ? 'Speed round' : unitId === MY_WORDS ? 'My words' : unitId === REVIEW ? 'Review' : unitById(unitId)?.title ?? 'Lesson');

const feedbackText = (verdict: 'right' | 'accents' | 'wrong', answer: string) =>
  (verdict === 'right' ? 'Right.' : verdict === 'accents' ? `Right, but watch the accents: ${answer}` : `Not quite. Answer: ${answer}`);

/**
 * One lesson of a unit, sized by its level (teaching.ts): a grammar or theme note first,
 * then short exercises from recognising to producing, then stars, XP and the streak. Every
 * answer also updates the word's review schedule. Speed round: as many as you can in a minute.
 */
export const LessonScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { unitId, mode } = useRoute<any>().params as { unitId: string; mode?: 'speed' };
  const speed = mode === 'speed';
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const code = useLanguage((s) => s.language);
  const langName = LANGUAGES.find((l) => l.code === code)?.name ?? code;
  const unit = unitById(unitId);
  const guide = levelGuide(unit?.level ?? useLanguage.getState().level);
  const title = lessonTitle(unitId, speed);
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [step, setStep] = useState('Getting the words ready...');
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [attempt, setAttempt] = useState<Attempt>(EMPTY);
  const [result, setResult] = useState<{ stars: number; xp: number; streak: number } | null>(null);
  const [results, setResults] = useState<{ t: string; right: boolean }[]>([]);
  const [tip, setTip] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(SPEED_SECONDS);

  const start = () => {
    setError(null); setExercises(null); setI(0); setRight(0); setAttempt(EMPTY); setResult(null); setResults([]); setSecondsLeft(SPEED_SECONDS);
    languageService.unitWords(unitId, setStep)
      .then((items) => {
        setTip(speed ? '' : languageService.tipFor(unitId));
        setExercises(buildLesson(items, Date.now(), speed ? { length: 40, production: 0 } : { length: guide.lessonLength, production: guide.production }));
      })
      .catch((e) => setError(String(e?.message || e)));
  };
  useEffect(start, [unitId, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = exercises?.[i];
  const verdict = ex && ex.kind !== 'match' ? checkTyped(attempt.value, ex.answer) : 'wrong';
  const correct = verdict !== 'wrong';
  const finish = (score: number, done: { t: string; right: boolean }[]) =>
    setResult(languageService.finishLesson(unitId, { right: score, total: speed ? Math.max(score, i + 1) : exercises!.length, results: done }));
  const next = (gotIt: boolean) => {
    const score = right + (gotIt ? 1 : 0);
    const words = ex?.kind === 'match' ? ex.pairs.map((p) => ({ t: p.t, right: gotIt })) : ex ? [{ t: ex.item.t, right: gotIt }] : [];
    const done = [...results, ...words];
    setRight(score); setResults(done); setAttempt(EMPTY);
    if (i + 1 < (exercises?.length ?? 0)) { setI(i + 1); return; }
    finish(score, done);
  };
  // Speed round: the clock runs while exercises are on screen; when it hits zero the round ends.
  useEffect(() => {
    if (!speed || !exercises || result || tip) return;
    if (secondsLeft <= 0) { finish(right, results); return; }
    const t = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [speed, exercises, result, secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps
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

  if (tip) return <LessonTip title={title} grammar={unit?.kind === 'grammar'} tip={tip} onStart={() => setTip('')} />;

  if (result) {
    return (
      <LessonDone title={title} result={result} summary={speed ? `${right} right in ${SPEED_SECONDS} seconds` : `${right} of ${exercises.length} right`}
        aiMade={languageService.isAiMade(unitId)} onAgain={start} onRewrite={rewrite} />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Leave lesson"><Icon name="x" size={22} color={colors.text} /></TouchableOpacity>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${(speed ? secondsLeft / SPEED_SECONDS : i / exercises.length) * 100}%` }]} /></View>
        {speed && <Text style={styles.meta} testID="speed-clock">{secondsLeft}s</Text>}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <ExerciseView key={i} ex={ex!} lang={code} langName={langName} attempt={attempt}
          onPick={(value) => setAttempt({ value, checked: false })} onMatched={(mistakes) => next(mistakes <= 1)} />
      </ScrollView>
      {ex!.kind !== 'match' && (
        <View style={styles.footer}>
          {attempt.checked && (
            <Text style={styles.feedback} testID="lesson-feedback">
              {feedbackText(verdict, ex!.answer)}
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

function LessonTip({ title, grammar, tip, onStart }: { title: string; grammar: boolean; tip: string; onStart: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body} testID="lesson-tip">
        <Text style={styles.prompt}>{grammar ? 'How it works' : 'Good to know'}</Text>
        <Text style={styles.big}>{title}</Text>
        <Text style={styles.tip}>{tip}</Text>
        <Button title="Start the lesson" onPress={onStart} testID="lesson-start" />
      </ScrollView>
    </SafeAreaView>
  );
}

function LessonDone({ title, result, summary, aiMade, onAgain, onRewrite }: {
  title: string; result: { stars: number; xp: number; streak: number }; summary: string; aiMade: boolean; onAgain: () => void; onRewrite: () => void;
}) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center} testID="lesson-done">
        <Text style={styles.big}>{title} done</Text>
        <View style={styles.starsRow}>{[1, 2, 3].map((n) => <Icon key={n} name="star" size={36} color={n <= result.stars ? colors.primary : colors.border} />)}</View>
        <Text style={styles.feedback}>{summary} · +{result.xp} XP · {result.streak} day streak</Text>
        <Button title="Back to the board" onPress={() => navigation.goBack()} testID="lesson-back" />
        <Button title="Practice again" variant="outline" onPress={onAgain} />
        {aiMade && (
          <TouchableOpacity onPress={onRewrite}><Text style={styles.meta}>Written by the AI on your phone. Wording looks wrong? Rewrite it.</Text></TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
