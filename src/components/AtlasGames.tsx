import React, { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

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
  const [game, setGame] = useState<'menu' | 'tic' | 'guess' | 'math'>('menu');
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 100) + 1);
  const [guess, setGuess] = useState(50);
  const [attempts, setAttempts] = useState(0);
  const [a, setA] = useState(4);
  const [b, setB] = useState(7);
  const [answer, setAnswer] = useState(0);
  const [score, setScore] = useState(0);
  const start = (id: typeof game) => { setGame(id); setBoard(emptyBoard()); setTarget(Math.floor(Math.random()*100)+1); setGuess(50); setAttempts(0); setScore(0); setA(Math.ceil(Math.random()*12)); setB(Math.ceil(Math.random()*12)); };
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
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 14 }}>Atlas Offline Arcade</Text>
      {press('← ' + (game === 'menu' ? 'Close' : 'All games'), () => game === 'menu' ? onClose() : setGame('menu'))}
      {game === 'menu' && <>
        <Text style={{ color: colors.textSecondary, marginBottom: 15 }}>Playable locally, with no model, connection or account required.</Text>
        {press('Tic-Tac-Toe — play against Atlas', () => start('tic'))}
        {press('Number Guess — find the secret number', () => start('guess'))}
        {press('Math Sprint — multiplication practice', () => start('math'))}
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
        {press('Submit guess', () => { setAttempts(v=>v+1); })}
        {attempts > 0 && <Text style={{ color: colors.text, marginBottom: 15 }}>{guess === target ? 'Correct! Secret number found.' : guess < target ? 'Go higher' : 'Go lower'}</Text>}
        {press('Start over', () => start('guess'))}
      </>}
      {game === 'math' && <>
        <Text style={{ color: colors.text, fontSize: 18 }}>Score: {score}</Text>
        <Text style={{ fontSize: 36, color: colors.text, textAlign: 'center', marginVertical: 25 }}>{a} × {b} = ?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>{[0,1,2,3,4,5,6,7,8,9].map(n => <TouchableOpacity key={n} onPress={() => setAnswer(v => Number(String(v)+n) % 10000)} style={{ padding: 18, margin: 5, backgroundColor: colors.surface, borderRadius: 9 }}><Text style={{ color: colors.text, fontSize: 20 }}>{n}</Text></TouchableOpacity>)}</View>
        <Text style={{ fontSize: 27, textAlign: 'center', color: colors.text, margin: 15 }}>{answer}</Text>
        {press('Clear', () => setAnswer(0))}
        {press('Check answer / Next', () => { if (answer === a*b) setScore(v=>v+1); setAnswer(0); setA(Math.ceil(Math.random()*12)); setB(Math.ceil(Math.random()*12)); })}
      </>}
    </ScrollView>
  </Modal>;
}
