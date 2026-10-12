import React, { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { Direction2048, empty2048, hasMoves2048, move2048, spawn2048 } from '../utils/game2048';
import { MineGrid, mineResult, newMineGrid, revealMines } from '../utils/minesweeper';
import { moveSnake, newSnake, SnakeDirection } from '../utils/snake';
import { AtlasSudoku } from './AtlasSudoku';
import { AtlasSurvival } from './AtlasSurvival';
import { AtlasTechTree } from './AtlasTechTree';

const WORDS = ['PUZZLE','PLANET','JOURNAL','ROBOT','GALAXY','GARDEN','COMPASS','ARCADE'];
const TRIVIA = [
  { q: 'Which planet is known as the Red Planet?', options: ['Venus','Mars','Jupiter','Saturn'], correct: 1 },
  { q: 'What is the largest ocean?', options: ['Atlantic','Indian','Pacific','Arctic'], correct: 2 },
  { q: 'What is 12 × 8?', options: ['84','96','108','98'], correct: 1 },
  { q: 'How many sides does a hexagon have?', options: ['5','6','7','8'], correct: 1 },
  { q: 'Which gas do plants absorb for photosynthesis?', options: ['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'], correct: 2 },
];
type Board = number[];
const emptyBoard = (): Board => Array(9).fill(0);
const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function winner(b: Board): number {
  for (const [a,c,d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 3 : 0;
}
export const evaluateTicTacToe = winner;

export function AtlasGames({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [game, setGame] = useState<'menu' | 'tic' | 'guess' | 'math' | 'rps' | 'memory' | '2048' | 'mines' | 'snake' | 'word' | 'trivia' | 'sudoku' | 'survival' | 'techtree'>('menu');
  const [word, setWord] = useState('PLANET');
  const [letters, setLetters] = useState<string[]>([]);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [triviaScore, setTriviaScore] = useState(0);
  const [triviaAnswered, setTriviaAnswered] = useState(false);
  const [snake, setSnake] = useState(() => newSnake());
  const [mines, setMines] = useState<MineGrid>(() => newMineGrid());
  const [placingFlags, setPlacingFlags] = useState(false);
  const [grid2048, setGrid2048] = useState<number[]>(() => spawn2048(spawn2048(empty2048())));
  const [score2048, setScore2048] = useState(0);
  const [rpsResult, setRpsResult] = useState('Choose rock, paper or scissors.');
  const [rpsScore, setRpsScore] = useState({ wins: 0, losses: 0, draws: 0 });
  const [memoryCards, setMemoryCards] = useState<number[]>([1,2,3,4,1,2,3,4]);
  const [memoryOpen, setMemoryOpen] = useState<number[]>([]);
  const [memoryMatched, setMemoryMatched] = useState<number[]>([]);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 100) + 1);
  const [guess, setGuess] = useState(50);
  const [attempts, setAttempts] = useState(0);
  const [submittedGuess, setSubmittedGuess] = useState<number | null>(null);
  const [lastMathCorrect, setLastMathCorrect] = useState<boolean | null>(null);
  const [a, setA] = useState(4);
  const [b, setB] = useState(7);
  const [answer, setAnswer] = useState(0);
  const [score, setScore] = useState(0);
  const start = (id: typeof game) => { setGame(id); setBoard(emptyBoard()); setTarget(Math.floor(Math.random()*100)+1); setGuess(50); setAttempts(0); setSubmittedGuess(null); setLastMathCorrect(null); setScore(0); setA(Math.ceil(Math.random()*12)); setB(Math.ceil(Math.random()*12)); setWord(WORDS[Math.floor(Math.random() * WORDS.length)]); setLetters([]); setTriviaIndex(0); setTriviaScore(0); setTriviaAnswered(false); setSnake(newSnake()); setMines(newMineGrid()); setPlacingFlags(false); setGrid2048(spawn2048(spawn2048(empty2048()))); setScore2048(0); setRpsScore({ wins: 0, losses: 0, draws: 0 }); setRpsResult('Choose rock, paper or scissors.'); setMemoryCards([1,2,3,4,1,2,3,4].sort(() => Math.random()-0.5)); setMemoryOpen([]); setMemoryMatched([]); };
  const press = (label: string, fn: () => void) => <TouchableOpacity onPress={fn} style={{ padding: 13, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, marginBottom: 9 }}><Text style={{ color: colors.text, fontSize: 17 }}>{label}</Text></TouchableOpacity>;
  const tic = (idx: number) => {
    if (winner(board) || board[idx]) return;
    const next = [...board]; next[idx] = 1;
    if (!winner(next)) {
      // A deterministic, locally playable opponent: take a win, then block, then center.
      const available = next.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      const winMove = available.find(i => { const copy = [...next]; copy[i] = 2; return winner(copy) === 2; });
      const blockMove = available.find(i => { const copy = [...next]; copy[i] = 1; return winner(copy) === 1; });
      const choice = winMove ?? blockMove ?? (available.includes(4) ? 4 : available[Math.floor(Math.random() * available.length)]);
      if (choice !== undefined) next[choice] = 2;
    }
    setBoard(next);
  };
  const slide2048 = (direction: Direction2048) => {
    const result = move2048(grid2048, direction);
    if (result.moved) {
      setGrid2048(spawn2048(result.board));
      setScore2048(current => current + result.score);
    }
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 14 }}>Atlas Offline Arcade</Text>
      {press('← ' + (game === 'menu' ? 'Close' : 'All games'), () => game === 'menu' ? onClose() : setGame('menu'))}
      {game === 'menu' && <>
        <Text style={{ color: colors.textSecondary, marginBottom: 15 }}>Playable locally, with no model, connection or account required.</Text>
        {press('Tic-Tac-Toe — play against Atlas', () => start('tic'))}
        {press('Number Guess — find the secret number', () => start('guess'))}
        {press('Math Sprint — multiplication practice', () => start('math'))}
        {press('Rock Paper Scissors — challenge Atlas', () => start('rps'))}
        {press('Memory Match — find the matching pairs', () => start('memory'))}
        {press('2048 — slide and combine tiles', () => start('2048'))}
        {press('Minesweeper — reveal safe squares', () => start('mines'))}
        {press('Snake — grow without hitting a wall', () => start('snake'))}
        {press('Word Guess — uncover the hidden word', () => start('word'))}
        {press('Trivia — five quick questions', () => start('trivia'))}
        {press('Sudoku — fill the 9×9 number puzzle', () => start('sudoku'))}
        {press('Wilderness Survival — make decisions to stay alive', () => start('survival'))}
        {press('Civilization Tech Tree — research your way to space', () => start('techtree'))}
      </>}
      {game === 'tic' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>{winner(board) === 1 ? 'You win!' : winner(board) === 2 ? 'Atlas wins' : winner(board) === 3 ? 'Draw!' : 'Your turn — X'}</Text>
        {[0,1,2].map(row => <View key={row} style={{ flexDirection: 'row', justifyContent: 'center' }}>
          {[0,1,2].map(col => { const i = row*3+col; return <TouchableOpacity key={i} onPress={() => tic(i)} style={{ width: 85, height: 85, margin: 4, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 36 }}>{board[i] === 1 ? 'X' : board[i] === 2 ? 'O' : ''}</Text></TouchableOpacity>; })}
        </View>)}
        {press('New round', () => setBoard(emptyBoard))}
      </>}
      {game === 'guess' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>Find the number between 1 and 100. Attempts: {attempts}</Text>
        <Text style={{ color: colors.text, fontSize: 42, textAlign: 'center' }}>{guess}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[-10,-1,1,10].map(delta => <TouchableOpacity key={delta} onPress={() => setGuess(v => Math.max(1,Math.min(100,v+delta)))} style={{ padding: 12, backgroundColor: colors.surface, borderRadius: 8 }}><Text style={{ color: colors.text }}>{delta > 0 ? '+' : ''}{delta}</Text></TouchableOpacity>)}
        </View>
        {press('Submit guess', () => { if (submittedGuess !== target) { setSubmittedGuess(guess); setAttempts(v=>v+1); } })}
        {submittedGuess !== null && <Text style={{ color: colors.text, marginBottom: 15 }}>{submittedGuess === target ? 'Correct! Secret number found.' : submittedGuess < target ? 'Go higher' : 'Go lower'}</Text>}
        {press('Start over', () => start('guess'))}
      </>}
      {game === 'math' && <>
        <Text style={{ color: colors.text, fontSize: 18 }}>Score: {score}</Text>
        <Text style={{ fontSize: 36, color: colors.text, textAlign: 'center', marginVertical: 25 }}>{a} × {b} = ?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>{[0,1,2,3,4,5,6,7,8,9].map(n => <TouchableOpacity key={n} onPress={() => setAnswer(v => Number(String(v)+n) % 10000)} style={{ padding: 18, margin: 5, backgroundColor: colors.surface, borderRadius: 9 }}><Text style={{ color: colors.text, fontSize: 20 }}>{n}</Text></TouchableOpacity>)}</View>
        <Text style={{ fontSize: 27, textAlign: 'center', color: colors.text, margin: 15 }}>{answer}</Text>
        {press('Clear', () => setAnswer(0))}
        {lastMathCorrect !== null && <Text style={{ color: colors.text }}>{lastMathCorrect ? 'Correct!' : 'Not quite. Keep practicing!'}</Text>}
        {press('Check answer / Next', () => { const correct = answer === a*b; setLastMathCorrect(correct); if (correct) setScore(v=>v+1); setAnswer(0); setA(Math.ceil(Math.random()*12)); setB(Math.ceil(Math.random()*12)); })}
      </>}
      {game === 'rps' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>{rpsResult}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Wins: {rpsScore.wins} · Losses: {rpsScore.losses} · Draws: {rpsScore.draws}</Text>
        {['Rock', 'Paper', 'Scissors'].map((choice, i) => press(choice, () => {
          const theirs = Math.floor(Math.random() * 3);
          const outcome = (i - theirs + 3) % 3;
          setRpsResult(`You: ${choice} · Atlas: ${['Rock', 'Paper', 'Scissors'][theirs]}. ${outcome === 0 ? 'Draw!' : outcome === 1 ? 'You win!' : 'Atlas wins!'}`);
          setRpsScore(s => outcome === 0 ? { ...s, draws: s.draws + 1 } : outcome === 1 ? { ...s, wins: s.wins + 1 } : { ...s, losses: s.losses + 1 });
        }))}
      </>}
      {game === 'memory' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>{memoryMatched.length === memoryCards.length ? 'All pairs matched!' : `${memoryMatched.length / 2} of 4 pairs found`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          {memoryCards.map((value, i) => <TouchableOpacity key={i} onPress={() => {
            if (memoryMatched.includes(i) || memoryOpen.includes(i)) return;
            if (memoryOpen.length === 2) { setMemoryOpen([i]); return; }
            if (memoryOpen.length === 1 && memoryCards[memoryOpen[0]] === value) {
              setMemoryMatched(current => [...current, memoryOpen[0], i]); setMemoryOpen([]);
            } else setMemoryOpen(current => [...current, i]);
          }} style={{ width: 67, height: 67, margin: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 26 }}>{memoryMatched.includes(i) || memoryOpen.includes(i) ? value : '?'}</Text></TouchableOpacity>)}
        </View>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Choose two cards. If they differ, tap another card to hide them and try again.</Text>
        {press('New round', () => start('memory'))}
      </>}
      {game === '2048' && <>
        <Text style={{ color: colors.text, fontSize: 19, marginBottom: 8 }}>2048 · Score: {score2048}</Text>
        {!hasMoves2048(grid2048) && <Text style={{ color: colors.error }}>No moves left. Start a new round.</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 340, alignSelf: 'center' }}>
          {grid2048.map((number, index) => <View key={index} style={{ width: 74, height: 74, justifyContent: 'center', alignItems: 'center', margin: 3, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: number >= 1024 ? 19 : 24 }}>{number || ''}</Text></View>)}
        </View>
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          {press('↑ Up', () => slide2048('up'))}
          <View style={{ flexDirection: 'row', gap: 20 }}>
            {press('← Left', () => slide2048('left'))}
            {press('↓ Down', () => slide2048('down'))}
            {press('→ Right', () => slide2048('right'))}
          </View>
        </View>
        {press('New 2048 round', () => start('2048'))}
      </>}
      {game === 'mines' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>Minesweeper · {mineResult(mines) === 'won' ? 'You cleared the minefield!' : mineResult(mines) === 'lost' ? 'Mine hit — game over' : 'Find the 7 mines without hitting one.'}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Flags placed: {mines.filter(c => c.flagged).length} · 7 mines</Text>
        {press(placingFlags ? 'Mode: Place flags (tap to switch)' : 'Mode: Reveal cells (tap to switch)', () => setPlacingFlags(v => !v))}
        <View style={{ width: 306, flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', marginBottom: 14 }}>
          {mines.map((cell, index) => <TouchableOpacity key={index} onPress={() => {
            if (mineResult(mines) !== 'playing') return;
            if (placingFlags) { if (!cell.revealed) setMines(cells => cells.map((c, i) => i === index ? { ...c, flagged: !c.flagged } : c)); }
            else setMines(cells => revealMines(cells, index));
          }} style={{ width: 45, height: 45, margin: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 5, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 19 }}>{cell.flagged ? '⚑' : cell.revealed ? (cell.mine ? '✕' : cell.nearby || '') : '?'}</Text></TouchableOpacity>)}
        </View>
        {press('New minefield', () => start('mines'))}
      </>}
      {game === 'snake' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 10 }}>Snake · Apples: {snake.score} {snake.over ? '· Game over' : ''}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Use the arrows to move one square at a time. Collect the apples and avoid walls and your tail.</Text>
        <View style={{ width: 304, flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' }}>
          {Array.from({ length: snake.size * snake.size }, (_, index) => <View key={index} style={{ width: 34, height: 34, margin: 2, borderRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 20 }}>{snake.body[0] === index ? '●' : snake.body.includes(index) ? '•' : snake.food === index ? '◆' : ''}</Text>
          </View>)}
        </View>
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          {press('↑ Up', () => setSnake(state => moveSnake(state, 'up')))}
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {(['left', 'down', 'right'] as SnakeDirection[]).map(direction => <View key={direction}>{press(direction === 'left' ? '← Left' : direction === 'down' ? '↓ Down' : '→ Right', () => setSnake(state => moveSnake(state, direction)))}</View>)}
          </View>
        </View>
        {press('New Snake game', () => start('snake'))}
      </>}
      {game === 'word' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>Word Guess · Wrong letters: {letters.filter(l => !word.includes(l)).length}/6</Text>
        <Text style={{ color: colors.text, fontSize: 29, textAlign: 'center', letterSpacing: 5, marginBottom: 20 }}>{word.split('').map(l => letters.includes(l) ? l : '_').join(' ')}</Text>
        {word.split('').every(l => letters.includes(l)) ? <Text style={{ color: colors.text }}>You solved it!</Text> : letters.filter(l => !word.includes(l)).length >= 6 ? <Text style={{ color: colors.text }}>Out of guesses! The word was {word}.</Text> :
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => <TouchableOpacity key={letter} disabled={letters.includes(letter)} onPress={() => setLetters(v => [...v, letter])} style={{ padding: 10, margin: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, opacity: letters.includes(letter) ? 0.3 : 1 }}><Text style={{ color: colors.text }}>{letter}</Text></TouchableOpacity>)}
          </View>}
        {press('New word', () => start('word'))}
      </>}
      {game === 'trivia' && <>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 10 }}>Question {Math.min(triviaIndex+1, TRIVIA.length)}/{TRIVIA.length} · Score {triviaScore}</Text>
        {triviaIndex < TRIVIA.length ? <>
          <Text style={{ color: colors.text, fontSize: 21, marginBottom: 15 }}>{TRIVIA[triviaIndex].q}</Text>
          {TRIVIA[triviaIndex].options.map((option, index) => press(option, () => {
            if (triviaAnswered) return;
            setTriviaAnswered(true);
            if (index === TRIVIA[triviaIndex].correct) setTriviaScore(s => s + 1);
          }))}
          {triviaAnswered && <>
            <Text style={{ color: colors.text, marginBottom: 12 }}>Answer: {TRIVIA[triviaIndex].options[TRIVIA[triviaIndex].correct]}</Text>
            {press('Next question', () => { setTriviaIndex(i => i+1); setTriviaAnswered(false); })}
          </>}
        </> : <Text style={{ color: colors.text, fontSize: 20 }}>Finished! You got {triviaScore} out of {TRIVIA.length}.</Text>}
        {press('Restart trivia', () => start('trivia'))}
      </>}
      {game === 'sudoku' && <AtlasSudoku />}
      {game === 'survival' && <AtlasSurvival />}
      {game === 'techtree' && <AtlasTechTree />}
    </ScrollView>
  </Modal>;
}
