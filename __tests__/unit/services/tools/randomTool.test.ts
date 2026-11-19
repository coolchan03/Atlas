import { randomNumber, rollDice, seededRng, uniformInt } from '../../../../src/services/tools/randomTool';
import { AVAILABLE_TOOLS } from '../../../../src/services/tools/registry';

describe('random_number', () => {
  it('stays inside the range and is reproducible with a seed, and says so', () => {
    const a = randomNumber({ min: 5, max: 9, count: 50, seed: 7 });
    expect(a).toBe(randomNumber({ min: 5, max: 9, count: 50, seed: 7 }));
    expect(a).toContain('reproducible, not random');
    const nums = a.split(' (')[0].split(', ').map(Number);
    expect(nums).toHaveLength(50);
    expect(nums.every((n) => n >= 5 && n <= 9)).toBe(true);
  });
  it('draws all different numbers when asked, including the whole range', () => {
    const nums = randomNumber({ min: 1, max: 10, count: 10, unique: true }).split(' (')[0].split(', ').map(Number);
    expect([...nums].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(() => randomNumber({ min: 1, max: 5, count: 6, unique: 'true' })).toThrow(/different/);
  });
  it('rejects bad input', () => {
    expect(() => randomNumber({ min: 10, max: 1 })).toThrow(/greater/);
    expect(() => randomNumber({ min: 1.5, max: 3 })).toThrow(/whole number/);
    expect(() => randomNumber({ min: 'abc' })).toThrow(/whole number/);
    expect(() => randomNumber({ count: 0 })).toThrow(/count/);
    expect(() => randomNumber({ count: 5000 })).toThrow(/count/);
    expect(() => randomNumber({ min: 0, max: 2 ** 40 })).toThrow(/too large/);
    expect(() => randomNumber({ min: 0, max: Number.MAX_SAFE_INTEGER + 2 })).toThrow(/whole number/);
  });
  it('handles negative ranges, single-value ranges and string arguments', () => {
    expect(randomNumber({ min: '-3', max: '-3' })).toMatch(/^-3 /);
    const n = Number(randomNumber({ min: -5, max: -1 }).split(' ')[0]);
    expect(n).toBeGreaterThanOrEqual(-5);
    expect(n).toBeLessThanOrEqual(-1);
  });
  it('maps a draw to a range without bias (rejects the uneven top slice)', () => {
    // 2^32 % 3 = 1: the draw 4294967295 would favour 0 and must be thrown away.
    const draws = [4294967295, 2];
    expect(uniformInt(0, 2, () => draws.shift() as number)).toBe(2);
    const rng = seededRng(1);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i += 1) counts[uniformInt(0, 5, rng)] += 1;
    counts.forEach((c) => expect(Math.abs(c - 10000)).toBeLessThan(500));
  });
});

describe('roll_dice', () => {
  it('rolls and totals with a modifier', () => {
    const text = rollDice({ sides: 6, count: 4, modifier: 2, seed: 3 });
    const rolls = /rolls ([\d, ]+),/.exec(text)![1].split(', ').map(Number);
    expect(rolls).toHaveLength(4);
    expect(rolls.every((r) => r >= 1 && r <= 6)).toBe(true);
    expect(text).toContain(`total ${rolls.reduce((a, b) => a + b, 0) + 2}`);
    expect(text.startsWith('4d6+2:')).toBe(true);
    expect(rollDice({ seed: 3 })).toMatch(/^1d6: rolls \d, total \d/);
  });
  it('rejects impossible dice', () => {
    expect(() => rollDice({ sides: 1 })).toThrow(/sides/);
    expect(() => rollDice({ sides: 5000 })).toThrow(/sides/);
    expect(() => rollDice({ count: 101 })).toThrow(/count/);
    expect(() => rollDice({ modifier: 'x' })).toThrow(/whole number/);
  });
});

it('is registered as chat tools with no network need', () => {
  const tools = AVAILABLE_TOOLS.filter((t) => ['random_number', 'roll_dice'].includes(t.id));
  expect(tools).toHaveLength(2);
  expect(tools.every((t) => !t.requiresNetwork)).toBe(true);
});
