/** Word games built from the project's key terms: memory pairs, hangman / term guess, fill the blanks. */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import type { LearningTerm } from '../../study/learningGames';
import {
  buildPairs, closeEnough, hangmanGuess, hangmanMask, hangmanStatus, HANGMAN_LIVES, shuffle, wordleFeedback,
  type ClozeItem, type HangmanState, type PairCard,
} from '../../study/games/logic';
import { Banner, BAD, Card, Choice, Finished, GameButton, GOOD, ScoreLine, SourceLinks, useGameColors, useRecord, type GameProps } from './kit';

// ----------------------------------------------------------------- memory pairs
export function PairsGame({ result, projectId, onOpenSource }: GameProps) {
  const colors = useGameColors();
  const { width } = useWindowDimensions();
  const terms: LearningTerm[] = result.game?.data?.terms ?? [];
  const [cards, setCards] = useState<PairCard[]>(result.game?.data?.cards ?? buildPairs(terms, 6));
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [started] = useState(Date.now());
  const record = useRecord(projectId);
  const pairs = cards.length / 2;
  const cols = width >= 700 ? 4 : 3;
  const tap = (card: PairCard) => {
    if (open.length === 2 || open.includes(card.id) || matched.includes(card.pair)) return;
    const next = [...open, card.id];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next.map((id) => cards.find((c) => c.id === id)!);
      const term = terms[a.pair];
      if (a.pair === b.pair) {
        setMatched((m) => [...m, a.pair]);
        if (term) record(term.clue, term.answer, true, term.src);
        setOpen([]);
      } else setTimeout(() => setOpen([]), 1000);
    }
  };
  const done = matched.length === pairs;
  const minMoves = pairs;
  const starsEarned = moves <= minMoves * 1.5 ? 3 : moves <= minMoves * 2.2 ? 2 : 1;
  return (
    <View>
      <Banner>Flip two cards. Match each term with its clue from your documents.</Banner>
      <ScoreLine score={matched.length} max={pairs} extra={`${moves} moves`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {cards.map((c) => {
          const shown = open.includes(c.id) || matched.includes(c.pair);
          return (
            <View key={c.id} style={{ width: `${100 / cols}%`, padding: 4 }}>
              <TouchableOpacity onPress={() => tap(c)} accessibilityLabel={shown ? c.text : 'Hidden card'} accessibilityRole="button"
                style={{ minHeight: 86, borderRadius: 10, padding: 8, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: matched.includes(c.pair) ? `${GOOD}33` : shown ? colors.surface : colors.primary }}>
                <Text style={{ color: shown ? colors.text : '#fff', fontSize: c.kind === 'term' ? 15 : 12, fontWeight: c.kind === 'term' ? '700' : '400', textAlign: 'center' }}>
                  {shown ? c.text : '?'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      {done && (
        <View>
          <Finished score={pairs} max={pairs} note={`${moves} moves, ${Math.round((Date.now() - started) / 1000)} s, ${'★'.repeat(starsEarned)}`}
            onAgain={() => { setCards(shuffle(cards)); setOpen([]); setMatched([]); setMoves(0); }} />
          {terms.slice(0, pairs).map((t) => (
            <Card key={t.answer}><Text style={{ color: colors.text, fontWeight: '700' }}>{t.answer}</Text><Text style={{ color: colors.textSecondary }}>{t.clue}</Text><SourceLinks nums={t.src} result={result} onOpenSource={onOpenSource} /></Card>
          ))}
        </View>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- hangman / term guess
const KEYS = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('');
export function HangmanGame({ result, projectId, onOpenSource }: GameProps) {
  const colors = useGameColors();
  const terms: LearningTerm[] = result.game?.data?.terms ?? [];
  const [mode, setMode] = useState<'hangman' | 'guess'>('hangman');
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<HangmanState>({ answer: terms[0]?.answer ?? '', guessed: [], lives: HANGMAN_LIVES });
  const [score, setScore] = useState(0);
  const [guesses, setGuesses] = useState<{ word: string; fb: string }[]>([]);
  const [typed, setTyped] = useState('');
  const record = useRecord(projectId);
  const term = terms[index];
  useEffect(() => { setState({ answer: term?.answer ?? '', guessed: [], lives: HANGMAN_LIVES }); setGuesses([]); setTyped(''); }, [index, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!term) return <Finished score={score} max={terms.length} onAgain={() => { setIndex(0); setScore(0); }} />;
  const status = mode === 'hangman' ? hangmanStatus(state)
    : guesses.some((g) => g.word === term.answer) ? 'won' : guesses.length >= 6 ? 'lost' : 'playing';
  const finish = (won: boolean) => { if (won) setScore((s) => s + 1); record(term.clue, term.answer, won, term.src); };
  const next = () => setIndex((i) => i + 1);
  const pressLetter = (l: string) => {
    const nextState = hangmanGuess(state, l);
    setState(nextState);
    const st = hangmanStatus(nextState);
    if (st !== 'playing' && hangmanStatus(state) === 'playing') finish(st === 'won');
  };
  const submitGuess = () => {
    const w = typed.toUpperCase().replace(/[^A-Z]/g, '');
    if (w.length !== term.answer.length) return;
    const list = [...guesses, { word: w, fb: wordleFeedback(w, term.answer) }];
    setGuesses(list); setTyped('');
    if (w === term.answer) finish(true); else if (list.length >= 6) finish(false);
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['hangman', 'guess'] as const).map((m) => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} accessibilityRole="button" style={{ padding: 8, borderRadius: 8, backgroundColor: mode === m ? colors.primary : colors.surface }}>
            <Text style={{ color: mode === m ? '#fff' : colors.text }}>{m === 'hangman' ? 'Hangman' : 'Term guess'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScoreLine score={score} max={terms.length} extra={`term ${index + 1} of ${terms.length}`} />
      <Card><Text style={{ color: colors.textSecondary }}>Clue</Text><Text style={{ color: colors.text, fontSize: 17 }}>{term.clue}</Text><SourceLinks nums={term.src} result={result} onOpenSource={onOpenSource} /></Card>
      {mode === 'hangman' ? (
        <View>
          <Text style={{ color: colors.text, fontSize: 28, letterSpacing: 4, textAlign: 'center', marginVertical: 12, fontWeight: '700' }}>{status === 'lost' ? [...term.answer].join(' ') : hangmanMask(state)}</Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{'♥'.repeat(Math.max(0, state.lives))}{'♡'.repeat(HANGMAN_LIVES - Math.max(0, state.lives))}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
            {KEYS.map((l) => {
              const used = state.guessed.includes(l);
              return (
                <TouchableOpacity key={l} disabled={used || status !== 'playing'} onPress={() => pressLetter(l)} accessibilityLabel={`Letter ${l}`}
                  style={{ width: 34, height: 42, margin: 2, borderRadius: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: used ? (term.answer.includes(l) ? `${GOOD}55` : `${BAD}44`) : colors.surface }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : (
        <View>
          <Banner>{term.answer.length} letters, 6 tries. Green: right place. Yellow: in the word. Grey: not in it.</Banner>
          {guesses.map((g, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 2 }}>
              {[...g.word].map((c, k) => (
                <View key={k} style={{ width: 32, height: 36, margin: 2, borderRadius: 4, justifyContent: 'center', alignItems: 'center', backgroundColor: g.fb[k] === 'g' ? GOOD : g.fb[k] === 'y' ? '#CA8A04' : '#6B7280' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{c}</Text>
                </View>
              ))}
            </View>
          ))}
          {status === 'playing' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput value={typed} onChangeText={(v) => setTyped(v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, term.answer.length))} autoCapitalize="characters" autoCorrect={false}
                placeholder={'_'.repeat(term.answer.length)} placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 12, letterSpacing: 3 }} />
              <GameButton label="Guess" onPress={submitGuess} disabled={typed.length !== term.answer.length} />
            </View>
          )}
          {status === 'lost' && <Text style={{ color: colors.text, textAlign: 'center', marginTop: 8 }}>It was <Text style={{ fontWeight: '800' }}>{term.answer}</Text></Text>}
        </View>
      )}
      {status !== 'playing' && (
        <View>
          <Text style={{ color: status === 'won' ? GOOD : BAD, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>{status === 'won' ? 'Correct!' : `The answer: ${term.answer}`}</Text>
          <GameButton label={index + 1 < terms.length ? 'Next term' : 'See score'} onPress={next} />
        </View>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- fill the blanks
export function ClozeGame({ result, projectId, onOpenSource }: GameProps) {
  const colors = useGameColors();
  const items: ClozeItem[] = useMemo(() => result.game?.data?.items ?? [], [result]);
  const [round, setRound] = useState<ClozeItem[]>(items);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [hard, setHard] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [missed, setMissed] = useState<ClozeItem[]>([]);
  const record = useRecord(projectId);
  const item = round[i];
  if (!item) {
    if (missed.length) {
      return (
        <View>
          <Banner>Round done. {missed.length} to retry.</Banner>
          <GameButton label="Retry the missed ones" onPress={() => { setRound(missed); setMissed([]); setI(0); setPicked(null); }} />
          <Finished score={score} max={items.length} />
        </View>
      );
    }
    return <Finished score={score} max={items.length} onAgain={() => { setRound(shuffle(items)); setI(0); setScore(0); setPicked(null); }} />;
  }
  const answer = (value: string) => {
    if (picked !== null) return;
    const ok = hard ? closeEnough(value, item.answer) : value === item.answer;
    setPicked(value);
    record(item.sentence, item.answer, ok, item.src);
    if (ok) { setScore((s) => s + (streak >= 2 ? 2 : 1)); setStreak((s) => s + 1); }
    else { setStreak(0); setMissed((m) => [...m, item]); }
  };
  const ok = picked !== null && (hard ? closeEnough(picked, item.answer) : picked === item.answer);
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ScoreLine score={score} max={items.length} extra={streak >= 2 ? `streak x${streak}` : undefined} />
        <TouchableOpacity onPress={() => setHard((h) => !h)} accessibilityRole="switch" accessibilityState={{ checked: hard }}><Text style={{ color: colors.primary }}>{hard ? 'Hard: typing' : 'Easy: word bank'}</Text></TouchableOpacity>
      </View>
      <Card><Text style={{ color: colors.text, fontSize: 17, lineHeight: 25 }}>{item.sentence}</Text><SourceLinks nums={item.src} result={result} onOpenSource={onOpenSource} /></Card>
      {hard ? (
        <View>
          <TextInput value={typed} onChangeText={setTyped} editable={picked === null} autoCapitalize="characters" placeholder="Type the missing word" placeholderTextColor={colors.textMuted} style={{ color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 12 }} />
          <GameButton label="Check" onPress={() => answer(typed)} disabled={!typed.trim() || picked !== null} />
        </View>
      ) : item.options.map((o) => (
        <Choice key={o} label={o} onPress={() => answer(o)} disabled={picked !== null}
          state={picked === null ? null : o === item.answer ? 'right' : o === picked ? 'wrong' : null} />
      ))}
      {picked !== null && (
        <View>
          <Text style={{ color: ok ? GOOD : BAD, fontWeight: '700', marginTop: 6 }}>{ok ? 'Correct!' : `Answer: ${item.answer}`}</Text>
          <GameButton label="Next" onPress={() => { setI((x) => x + 1); setPicked(null); setTyped(''); }} />
        </View>
      )}
    </View>
  );
}
