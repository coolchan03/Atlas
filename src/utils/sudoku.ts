/** Fixed offline Sudoku puzzle with a known valid solution. */
export const SUDOKU_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
export const SUDOKU_START = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
export const sudokuClues = (): number[] => SUDOKU_START.split('').map(Number);
export function sudokuValid(board: number[]): boolean {
  if (board.length !== 81) return false;
  const groups: number[][] = [];
  for (let n = 0; n < 9; n++) {
    groups.push(Array.from({length:9},(_,i)=> board[n*9+i]));
    groups.push(Array.from({length:9},(_,i)=> board[i*9+n]));
    const baseRow = Math.floor(n/3)*3, baseCol = (n%3)*3;
    groups.push(Array.from({length:9},(_,i)=> board[(baseRow+Math.floor(i/3))*9+baseCol+(i%3)]));
  }
  return groups.every(group => {
    const values = group.filter(v=>v>0);
    return values.every(v=>v>=1&&v<=9) && new Set(values).size===values.length;
  });
}
export function sudokuSolved(board: number[]): boolean {
  return board.length === 81 && board.every(n=>n>=1&&n<=9) && sudokuValid(board);
}
