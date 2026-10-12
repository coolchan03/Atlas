/** Deterministic pure Minesweeper helpers; UI chooses a random mine seed. */
export interface MineCell { mine: boolean; nearby: number; revealed: boolean; flagged: boolean }
export type MineGrid = MineCell[];

export function newMineGrid(size = 6, mines = 7, random: () => number = Math.random): MineGrid {
  if (size < 2 || mines < 1 || mines >= size * size) throw new Error('Invalid minefield configuration');
  const cells: MineGrid = Array.from({ length: size * size }, () => ({ mine: false, nearby: 0, revealed: false, flagged: false }));
  const chosen = new Set<number>();
  while (chosen.size < mines) chosen.add(Math.min(size * size - 1, Math.floor(random() * size * size)));
  for (const index of chosen) cells[index].mine = true;
  for (let index = 0; index < cells.length; index++) {
    const row = Math.floor(index / size), col = index % size;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c].mine) count++;
    }
    cells[index].nearby = count;
  }
  return cells;
}

export function revealMines(grid: MineGrid, index: number, size = 6): MineGrid {
  if (!grid[index] || grid[index].flagged || grid[index].revealed) return grid;
  const next = grid.map(cell => ({ ...cell }));
  const queue = [index];
  const seen = new Set<number>();
  while (queue.length) {
    const current = queue.pop()!;
    if (seen.has(current) || next[current].flagged || next[current].revealed) continue;
    seen.add(current);
    next[current].revealed = true;
    if (next[current].mine || next[current].nearby) continue;
    const row = Math.floor(current / size), col = current % size;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) queue.push(nr * size + nc);
    }
  }
  return next;
}
export function mineResult(grid: MineGrid): 'playing' | 'won' | 'lost' {
  if (grid.some(c => c.mine && c.revealed)) return 'lost';
  if (grid.every(c => c.mine || c.revealed)) return 'won';
  return 'playing';
}
