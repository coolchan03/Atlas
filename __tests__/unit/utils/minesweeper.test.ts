import { mineResult, newMineGrid, revealMines } from '../../../src/utils/minesweeper';

describe('offline Minesweeper', () => {
  it('creates the requested number of mines and counts nearby mines', () => {
    let sequence = 0;
    const board = newMineGrid(6, 7, () => (sequence++ % 36) / 36);
    expect(board.filter(c => c.mine)).toHaveLength(7);
    expect(board.every(c => c.nearby >= 0 && c.nearby <= 8)).toBe(true);
  });
  it('reveals a selected safe tile', () => {
    const board = newMineGrid(6, 1, () => 0);
    const result = revealMines(board, 35);
    expect(result[35].revealed).toBe(true);
    expect(mineResult(result)).toBe('won');
    expect(board[35].revealed).toBe(false);
  });
  it('never opens a flagged cell', () => {
    const board = newMineGrid(6, 1, () => 0);
    board[1].flagged = true;
    expect(revealMines(board, 1)).toBe(board);
  });
  it('reports a lost game when a mine is opened', () => {
    const board = newMineGrid(6, 1, () => 0);
    expect(mineResult(revealMines(board, 0))).toBe('lost');
  });
});
