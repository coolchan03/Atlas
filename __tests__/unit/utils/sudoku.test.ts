import { sudokuClues, sudokuSolved, sudokuValid, SUDOKU_SOLUTION } from '../../../src/utils/sudoku';

describe('offline Sudoku', () => {
  it('starts incomplete and includes fixed clues', () => {
    const board = sudokuClues();
    expect(board).toHaveLength(81);
    expect(board.filter(Boolean).length).toBeGreaterThan(15);
    expect(sudokuValid(board)).toBe(true);
    expect(sudokuSolved(board)).toBe(false);
  });
  it('recognizes a valid complete solution', () => {
    const solution = SUDOKU_SOLUTION.split('').map(Number);
    expect(sudokuSolved(solution)).toBe(true);
    sudokuClues().forEach((v,i) => { if (v) expect(solution[i]).toBe(v); });
  });
  it('rejects duplicated row or column values', () => {
    const wrong = SUDOKU_SOLUTION.split('').map(Number);
    wrong[0] = wrong[1];
    expect(sudokuValid(wrong)).toBe(false);
  });
});
