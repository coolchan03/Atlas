import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';
import type { StudyResult, Source } from '../study/engine';
import { matchWordSearch, normalizeLearningWord, type LearningTerm } from '../study/learningGames';

type Props = { activity: StudyResult; onOpenSource: (source: Source) => void };

export function ProjectLearningGame({ activity, onOpenSource }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [solved, setSolved] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [entryText, setEntryText] = useState('');
  const [firstCell, setFirstCell] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchingScore, setMatchingScore] = useState(0);
  const [matchingPicked, setMatchingPicked] = useState<string | null>(null);
  const terms = activity.learningTerms || [];
  const sourceLinks = (nums: number[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 }}>
      {nums.map(n => {
        const source = activity.sources.find(s => s.n === n);
        return source ? <TouchableOpacity key={n} onPress={() => onOpenSource(source)}><Text style={{ color: colors.primary, fontSize: 12 }}>[{n}] {source.doc.slice(0, 30)}</Text></TouchableOpacity> : null;
      })}
    </View>
  );
  const banner = (message: string) => <Text style={{ color: colors.textSecondary, marginVertical: 8 }}>{message}</Text>;
  const button = (label: string, action: () => void, disabled = false) =>
    <TouchableOpacity onPress={action} disabled={disabled} style={{ padding: 11, borderRadius: 8, marginVertical: 6, backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{label}</Text></TouchableOpacity>;
  const crossword = activity.crossword;
  if (activity.kind === 'crossword' && crossword) {
    const cellSize = Math.min(22, Math.max(15, Math.floor((width - 42) / crossword.size)));
    const activeEntry = crossword.entries.find(e => e.id === selected);
    const shownLetters = Array(crossword.cells.length).fill('');
    solved.forEach(id => {
      const entry = crossword.entries.find(e => e.id === id);
      if (!entry) return;
      for (let k = 0; k < entry.answer.length; k++) {
        const row = entry.row + (entry.direction === 'down' ? k : 0);
        const col = entry.col + (entry.direction === 'across' ? k : 0);
        shownLetters[row * crossword.size + col] = entry.answer[k];
      }
    });
    return <View>
      {banner('Select a clue, type the answer, then check it. Every answer comes from a source passage.')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cellSize * crossword.size, alignSelf: 'center' }}>
        {crossword.cells.map((char, i) => {
          const row = Math.floor(i / crossword.size), col = i % crossword.size;
          const highlighted = activeEntry && Array.from({ length: activeEntry.answer.length }, (_, k) =>
            (activeEntry.row + (activeEntry.direction === 'down' ? k : 0)) * crossword.size +
            activeEntry.col + (activeEntry.direction === 'across' ? k : 0)).includes(i);
          return <View key={i} style={{ width: cellSize, height: cellSize, borderWidth: char ? 0.5 : 0, borderColor: colors.textMuted, backgroundColor: !char ? colors.background : highlighted ? colors.primary + '44' : colors.surface, justifyContent: 'center', alignItems: 'center' }}>
            {!!char && <Text style={{ color: colors.text, fontWeight: '700', fontSize: Math.max(10, cellSize - 6) }}>{shownLetters[i]}</Text>}
            {!!char && !shownLetters[i] && crossword.entries.some(e => e.row === row && e.col === col) && <Text style={{ position: 'absolute', top: 0, left: 1, fontSize: 7, color: colors.textMuted }}>{crossword.entries.find(e => e.row === row && e.col === col)?.number}</Text>}
          </View>;
        })}
      </View>
      {banner(solved.length === crossword.entries.length ? 'All clues solved!' : 'Solved ' + solved.length + ' of ' + crossword.entries.length + ' clues')}
      {crossword.entries.map(entry => <TouchableOpacity key={entry.id} onPress={() => { setSelected(entry.id); setEntryText(''); setNotice(''); }} style={{ padding: 10, marginVertical: 3, backgroundColor: selected === entry.id ? colors.primary + '22' : colors.surface, borderRadius: 7 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{entry.number} {entry.direction === 'across' ? 'Across' : 'Down'} · {entry.clue} ({entry.answer.length}) {solved.includes(entry.id) ? '✓' : ''}</Text>
        {sourceLinks(entry.src)}
      </TouchableOpacity>)}
      {activeEntry && !solved.includes(activeEntry.id) && <View style={{ marginTop: 12 }}>
        <TextInput value={entryText} onChangeText={setEntryText} autoCapitalize="characters" autoCorrect={false} maxLength={activeEntry.answer.length} placeholder="Type your answer" placeholderTextColor={colors.textMuted} style={{ color: colors.text, backgroundColor: colors.surface, borderRadius: 8, padding: 12 }} />
        {button('Check answer', () => {
          if (normalizeLearningWord(entryText) === activeEntry.answer) { setSolved(ids => [...ids, activeEntry.id]); setSelected(null); setEntryText(''); setNotice('Correct!'); }
          else setNotice('Not quite. Try again.');
        })}
      </View>}
      {!!notice && banner(notice)}
    </View>;
  }
  const wordSearch = activity.wordSearch;
  if (activity.kind === 'wordsearch' && wordSearch) {
    const cellSize = Math.min(24, Math.max(17, Math.floor((width - 40) / wordSearch.size)));
    const foundIndices = new Set<number>();
    solved.forEach(id => {
      const entry = wordSearch.entries.find(e => e.id === id);
      if (!entry) return;
      for (let k = 0; k < entry.answer.length; k++) foundIndices.add((entry.row + entry.dr * k) * wordSearch.size + entry.col + entry.dc * k);
    });
    const tap = (index: number) => {
      if (firstCell === null) { setFirstCell(index); setNotice('Now tap the last letter of the word.'); return; }
      const matching = wordSearch.entries.find(e => !solved.includes(e.id) && matchWordSearch(e, firstCell, index, wordSearch.size));
      if (matching) { setSolved(ids => [...ids, matching.id]); setNotice('Found ' + matching.answer + '!'); }
      else setNotice('No matching word along those cells. Try again.');
      setFirstCell(null);
    };
    return <View>
      {banner('Find words from the project passages. Tap a word’s first letter, then its last letter; either direction works.')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cellSize * wordSearch.size, alignSelf: 'center' }}>
        {wordSearch.cells.map((char, index) => <TouchableOpacity key={index} onPress={() => tap(index)} style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center', borderRadius: 2, backgroundColor: foundIndices.has(index) ? '#22C55E44' : firstCell === index ? colors.primary + '55' : colors.surface }}>
          <Text style={{ color: colors.text, fontSize: Math.max(11, cellSize - 7), fontWeight: '600' }}>{char}</Text>
        </TouchableOpacity>)}
      </View>
      {banner(notice || ('Found ' + solved.length + ' of ' + wordSearch.entries.length + ' words'))}
      {wordSearch.entries.map(entry => <View key={entry.id} style={{ paddingVertical: 5 }}>
        <Text style={{ color: colors.text }}>{solved.includes(entry.id) ? '✓ ' : '○ '}{entry.clue} ({entry.answer.length} letters)</Text>
        {solved.includes(entry.id) && <Text style={{ color: colors.primary, fontWeight: '600' }}>{entry.answer}</Text>}
        {sourceLinks(entry.src)}
      </View>)}
    </View>;
  }
  if (activity.kind === 'match') {
    const termsWithOptions = terms.slice(0, 8);
    const current = termsWithOptions[matchIndex];
    return <View>
      {banner('Match each clue to the corresponding term from this project’s documents.')}
      <Text style={{ color: colors.text, marginBottom: 12 }}>Correct: {matchingScore} / {termsWithOptions.length} · Round {Math.min(matchIndex + 1, termsWithOptions.length)}</Text>
      {current ? <View>
        <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 10 }}>{current.clue}</Text>
        {sourceLinks(current.src)}
        {termsWithOptions.map((candidate, i) => <TouchableOpacity key={i} disabled={matchingPicked !== null} onPress={() => {
          setMatchingPicked(candidate.answer);
          if (candidate.answer === current.answer) setMatchingScore(score => score + 1);
        }} style={{ padding: 13, marginVertical: 5, borderRadius: 9, borderColor: colors.border, borderWidth: 1, backgroundColor: matchingPicked === candidate.answer ? colors.primary + '33' : colors.surface }}>
          <Text style={{ color: colors.text }}>{candidate.answer}</Text>
        </TouchableOpacity>)}
        {matchingPicked !== null && <View>
          {banner(matchingPicked === current.answer ? 'Correct!' : 'Correct answer: ' + current.answer)}
          {button('Next clue', () => { setMatchIndex(index => index + 1); setMatchingPicked(null); })}
        </View>}
      </View> : <Text style={{ color: colors.text, fontSize: 20 }}>Complete! Score: {matchingScore} / {termsWithOptions.length}</Text>}
    </View>;
  }
  return banner('This learning activity is not available.');
}
