import { moveSnake, newSnake } from '../../../src/utils/snake';

describe('offline Snake', () => {
  it('starts with a two-segment snake and food off the body', () => {
    const state = newSnake(8, () => 0);
    expect(state.body).toHaveLength(2);
    expect(state.body).not.toContain(state.food);
  });
  it('moves one cell per turn without increasing length', () => {
    const state = newSnake(8, () => 0);
    const next = moveSnake(state, 'right');
    expect(next.body[0]).toBe(state.body[0] + 1);
    expect(next.body).toHaveLength(2);
    expect(next.over).toBe(false);
  });
  it('does not allow an immediate reversal into its own body', () => {
    const state = newSnake(8, () => 0);
    const next = moveSnake(state, 'left');
    expect(next.direction).toBe('right');
    expect(next.over).toBe(false);
  });
  it('ends the game on wall collision', () => {
    let state = newSnake(8, () => 0);
    for (let i = 0; i < 5; i++) state = moveSnake(state, 'right');
    expect(state.over).toBe(true);
  });
});
