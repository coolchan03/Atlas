/** Pure turn-based Snake game logic, with deterministic food placement for tests. */
export type SnakeDirection = 'up' | 'down' | 'left' | 'right';
export interface SnakeState { size: number; body: number[]; food: number; direction: SnakeDirection; over: boolean; score: number }
const initialFood = (body: number[], size: number, random: () => number): number => {
  const open = Array.from({ length: size * size }, (_, i) => i).filter(i => !body.includes(i));
  return open.length ? open[Math.min(open.length - 1, Math.floor(random() * open.length))] : -1;
};
export function newSnake(size = 8, random: () => number = Math.random): SnakeState {
  if (size < 4) throw new Error('Snake board must be at least 4×4');
  const start = Math.floor(size / 2) * size + Math.floor(size / 2);
  const body = [start, start - 1];
  return { size, body, food: initialFood(body, size, random), direction: 'right', over: false, score: 0 };
}
export function moveSnake(state: SnakeState, direction: SnakeDirection, random: () => number = Math.random): SnakeState {
  if (state.over) return state;
  const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
  const heading = reverse[state.direction] === direction ? state.direction : direction;
  const row = Math.floor(state.body[0] / state.size), col = state.body[0] % state.size;
  const nextRow = row + (heading === 'up' ? -1 : heading === 'down' ? 1 : 0);
  const nextCol = col + (heading === 'left' ? -1 : heading === 'right' ? 1 : 0);
  if (nextRow < 0 || nextRow >= state.size || nextCol < 0 || nextCol >= state.size) return { ...state, over: true };
  const head = nextRow * state.size + nextCol;
  const eating = head === state.food;
  const bodyToCheck = eating ? state.body : state.body.slice(0, -1);
  if (bodyToCheck.includes(head)) return { ...state, over: true };
  const body = [head, ...state.body.slice(0, eating ? state.body.length : -1)];
  const food = eating ? initialFood(body, state.size, random) : state.food;
  return { ...state, body, food, direction: heading, over: food === -1, score: state.score + (eating ? 1 : 0) };
}
