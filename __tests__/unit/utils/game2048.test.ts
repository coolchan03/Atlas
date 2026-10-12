import { empty2048, hasMoves2048, move2048, spawn2048 } from '../../../src/utils/game2048';

describe('offline 2048 gameplay', () => {
  it('merges pairs exactly once and increments the score', () => {
    const result = move2048([2,2,2,2, ...Array(12).fill(0)], 'left');
    expect(result.board.slice(0,4)).toEqual([4,4,0,0]);
    expect(result.score).toBe(8);
    expect(result.moved).toBe(true);
  });
  it('does not spawn on a move that does not change the board', () => {
    const result = move2048([2,4,8,16,...Array(12).fill(0)], 'left');
    expect(result.moved).toBe(false);
  });
  it('moves vertically correctly', () => {
    const result = move2048([2,0,0,0,2,0,0,0,...Array(8).fill(0)], 'down');
    expect(result.board[12]).toBe(4);
    expect(result.score).toBe(4);
  });
  it('spawns in an empty square only', () => {
    const board = empty2048();
    const next = spawn2048(board, () => 0);
    expect(next[0]).toBe(2);
    expect(next.filter(Boolean)).toHaveLength(1);
  });
  it('recognizes game-over boards', () => {
    const noMoves = [2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,2];
    expect(hasMoves2048(noMoves)).toBe(false);
  });
});
