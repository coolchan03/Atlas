import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';
import { sudokuClues, sudokuSolved, sudokuValid } from '../utils/sudoku';

export function AtlasSudoku() {
  const { colors } = useTheme();
  const [board, setBoard] = useState<number[]>(sudokuClues);
  const [selected, setSelected] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const clues = sudokuClues();
  const put = (value: number) => {
    if (selected === null || clues[selected] !== 0) return;
    const next = [...board]; next[selected] = value;
    if (value !== 0 && !sudokuValid(next)) setMistakes(n=>n+1);
    setBoard(next);
  };
  return <View style={{ gap: 12 }}>
    <Text style={{ color: colors.text, fontSize: 18 }}>Sudoku · {sudokuSolved(board) ? 'Solved!' : 'Mistakes: ' + mistakes}</Text>
    <Text style={{ color: colors.textSecondary }}>Tap a blank square, then choose 1–9. Rows, columns and 3×3 boxes must contain no duplicates.</Text>
    <View style={{ width: 315, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap' }}>
      {board.map((number,index) => <TouchableOpacity key={index} onPress={() => setSelected(index)} style={{ width:35, height:35, borderColor: selected===index ? colors.primary : colors.border, borderWidth: selected===index ? 2 : 1, backgroundColor: colors.surface, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ color: clues[index] ? colors.text : colors.primary, fontSize:17, fontWeight: clues[index] ? '700' : '400' }}>{number || ''}</Text>
      </TouchableOpacity>)}
    </View>
    <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'center' }}>
      {[1,2,3,4,5,6,7,8,9,0].map(n=><TouchableOpacity key={n} onPress={()=>put(n)} style={{ padding:9, borderRadius:7, backgroundColor:colors.surface, margin:3, minWidth:36, alignItems:'center' }}><Text style={{ color:colors.text, fontSize:18 }}>{n || '⌫'}</Text></TouchableOpacity>)}
    </View>
    <TouchableOpacity onPress={()=>{setBoard(sudokuClues());setSelected(null);setMistakes(0);}} style={{ padding:13, backgroundColor:colors.surface, borderRadius:8, alignItems:'center' }}><Text style={{ color:colors.text }}>Restart puzzle</Text></TouchableOpacity>
  </View>;
}
