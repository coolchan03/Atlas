/** Pure logic for the offline 2048 game. Board is row-major, 0 means empty. */
export type Direction2048 = 'up' | 'down' | 'left' | 'right';
export type Grid2048 = number[];
export const empty2048 = (): Grid2048 => Array(16).fill(0);

export function spawn2048(board: Grid2048, random: () => number = Math.random): Grid2048 {
  const empty = board.map((n, i) => n === 0 ? i : -1).filter(i => i >= 0);
  if (!empty.length) return [...board];
  const index = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  const copy = [...board];
  copy[index] = random() < 0.9 ? 2 : 4;
  return copy;
}

function mergeLine(line: number[]): { tiles: number[]; gained: number } {
  const nonzero = line.filter(Boolean);
  let gained = 0;
  const tiles: number[] = [];
  for (let i = 0; i < nonzero.length; i++) {
    if (i + 1 < nonzero.length && nonzero[i] === nonzero[i + 1]) {
      const value = nonzero[i] * 2;
      tiles.push(value);
      gained += value;
      i++;
    } else tiles.push(nonzero[i]);
  }
  return { tiles: tiles.concat(Array(4 - tiles.length).fill(0)), gained };
}

export function move2048(board: Grid2048, direction: Direction2048):
  { board: Grid2048; score: number; moved: boolean } {
  if (board.length !== 16) throw new Error('Expected a 4×4 board');
  const next = [...board];
  let score = 0;
  for (let segment = 0; segment < 4; segment++) {
    const slots = Array.from({ length: 4 }, (_, n) =>
      direction === 'left' || direction === 'right' ? segment * 4 + n : n * 4 + segment);
    if (direction === 'right' || direction === 'down') slots.reverse();
    const result = mergeLine(slots.map(i => board[i]));
    result.tiles.forEach((v, k) => { next[slots[k]] = v; });
    score += result.gained;
  }
  return { board: next, score, moved: next.some((x, i) => x !== board[i]) };
}

export function hasMoves2048(board: Grid2048): boolean {
  return board.includes(0) || ['up','down','left','right'].some(direction =>
    move2048(board, direction as Direction2048).moved);
}
