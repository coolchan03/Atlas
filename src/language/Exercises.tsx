import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Choice } from '../components/games/kit';
import { speakIn } from '../atlasVoice/tts';
import { rng, type Exercise, type Item } from './lessons';
import { createStyles } from './LessonScreen.styles';

/** What the learner has picked so far, and whether the answer was checked. */
export interface Attempt { value: string; checked: boolean }

function Say({ item, lang, autoPlay }: { item: Item; lang: string; autoPlay?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  React.useEffect(() => { if (autoPlay) speakIn(item.t, lang, 'lesson'); }, [item.t]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TouchableOpacity style={styles.speaker} onPress={() => speakIn(item.t, lang, 'lesson')} accessibilityLabel="Play the word">
      <Icon name="volume-2" size={26} color={colors.background} />
    </TouchableOpacity>
  );
}

function Options({ ex, attempt, onPick }: { ex: Extract<Exercise, { options: string[] }>; attempt: Attempt; onPick: (v: string) => void }) {
  return (
    <View>
      {ex.options.map((o) => (
        <Choice key={o} label={o} disabled={attempt.checked} onPress={() => onPick(o)}
          state={attempt.checked ? (o === ex.answer ? 'right' : o === attempt.value ? 'wrong' : null) : o === attempt.value ? 'picked' : null} />
      ))}
    </View>
  );
}

/** Tap a word, then its translation. Finished when every pair is matched; `mistakes` counts wrong taps. */
function Match({ pairs, onDone }: { pairs: Item[]; onDone: (mistakes: number) => void }) {
  const styles = useThemedStyles(createStyles);
  const right = useMemo(() => { const r = rng(pairs.length * 7 + 3); return [...pairs].sort(() => r() - 0.5); }, [pairs]);
  const [left, setLeft] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [wrong, setWrong] = useState(0);
  const pick = (t: string) => {
    if (!left) return;
    if (pairs.find((p) => p.en === left)?.t === t) {
      const next = [...done, left];
      setDone(next);
      if (next.length === pairs.length) onDone(wrong);
    } else setWrong(wrong + 1);
    setLeft(null);
  };
  return (
    <View style={styles.columns}>
      <View style={styles.column}>
        {pairs.map((p) => (
          <Choice key={p.en} label={p.en} disabled={done.includes(p.en)} onPress={() => setLeft(p.en)}
            state={done.includes(p.en) ? 'right' : left === p.en ? 'picked' : null} />
        ))}
      </View>
      <View style={styles.column}>
        {right.map((p) => (
          <Choice key={p.t} label={p.t} disabled={done.includes(p.en)} onPress={() => pick(p.t)} state={done.includes(p.en) ? 'right' : null} />
        ))}
      </View>
    </View>
  );
}

function Build({ ex, attempt, onPick }: { ex: Extract<Exercise, { tiles: string[] }>; attempt: Attempt; onPick: (v: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const [used, setUsed] = useState<number[]>([]);
  const set = (next: number[]) => { setUsed(next); onPick(next.map((i) => ex.tiles[i]).join(' ')); };
  const tile = (i: number, onPress: () => void) => (
    <TouchableOpacity key={i} style={styles.tile} onPress={onPress} disabled={attempt.checked}><Text style={styles.tileText}>{ex.tiles[i]}</Text></TouchableOpacity>
  );
  return (
    <View>
      <View style={[styles.tiles, styles.answerLine]} testID="build-answer">{used.map((i) => tile(i, () => set(used.filter((u) => u !== i))))}</View>
      <View style={[styles.tiles, styles.pool]}>{ex.tiles.map((_, i) => (used.includes(i) ? null : tile(i, () => set([...used, i]))))}</View>
    </View>
  );
}

/** One exercise. Match reports its own result; the others report the picked answer for Check. */
export function ExerciseView({ ex, lang, langName, attempt, onPick, onMatched }: {
  ex: Exercise; lang: string; langName: string; attempt: Attempt; onPick: (v: string) => void; onMatched: (mistakes: number) => void;
}) {
  const styles = useThemedStyles(createStyles);
  if (ex.kind === 'match') return (<View><Text style={styles.prompt}>Match the pairs</Text><Match pairs={ex.pairs} onDone={onMatched} /></View>);
  if (ex.kind === 'build') return (
    <View>
      <Text style={styles.prompt}>Write this in {langName}</Text>
      <Text style={styles.big}>{ex.item.en}</Text>
      <Build ex={ex} attempt={attempt} onPick={onPick} />
    </View>
  );
  if (ex.kind === 'hear') return (
    <View>
      <Text style={styles.prompt}>Tap what you hear</Text>
      <Say item={ex.item} lang={lang} autoPlay />
      <Build ex={ex} attempt={attempt} onPick={onPick} />
    </View>
  );
  if (ex.kind === 'blank') return (
    <View>
      <Text style={styles.prompt}>Fill in the blank</Text>
      <Text style={styles.big}>{ex.shown}</Text>
      <Text style={styles.roman}>{ex.item.en}</Text>
      <Options ex={ex} attempt={attempt} onPick={onPick} />
    </View>
  );
  return (
    <View>
      <Text style={styles.prompt}>{ex.kind === 'choose' ? `Pick the ${langName} for` : ex.kind === 'meaning' ? 'What does this mean?' : 'Listen and pick what you hear'}</Text>
      {ex.kind === 'choose' && <Text style={styles.big}>{ex.item.en}</Text>}
      {ex.kind === 'meaning' && (
        <View style={styles.sayRow}>
          <Say item={ex.item} lang={lang} />
          <View><Text style={styles.big}>{ex.item.t}</Text>{!!ex.item.r && <Text style={styles.roman}>{ex.item.r}</Text>}</View>
        </View>
      )}
      {ex.kind === 'listen' && <Say item={ex.item} lang={lang} autoPlay />}
      <Options ex={ex} attempt={attempt} onPick={onPick} />
    </View>
  );
}
