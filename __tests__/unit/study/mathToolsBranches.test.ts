import { convertUnits, dateMath, describe as describeData, evalExpression, fractionOps, geometry, numberOps, percentOps, regression, sampleSize, solveEquation, studyMath, tPValue, tTest, tvm } from '../../../src/study/mathTools';

const run = (a: Record<string, unknown>) => JSON.parse(studyMath(a as never));

describe('mathTools: statistics', () => {
  it('describes one value and many', () => {
    expect(describeData([5])).toMatchObject({ n: 1, sampleVariance: null, sampleStdev: null, mean: 5, median: 5 });
    expect(describeData([1, 2, 3, 4])).toMatchObject({ median: 2.5, min: 1, max: 4, sampleVariance: 1.666667 });
  });
  it('t tests: one sample, paired, welch, and their errors', () => {
    expect(tTest([5, 6, 7, 8], undefined, { mu0: 5 })).toMatchObject({ kind: 'one-sample', df: 3 });
    expect(() => tTest([1])).toThrow(/at least 2/);
    expect(tTest([5, 7, 9], [4, 5, 6], { paired: true })).toMatchObject({ kind: 'one-sample' });
    expect(() => tTest([1, 2], [1], { paired: true })).toThrow(/equal lengths/);
    expect(tTest([1, 2, 3, 4], [3, 4, 5, 9])).toMatchObject({ kind: 'welch two-sample' });
    expect(tPValue(0, 10)).toBeCloseTo(1, 5);
    expect(tPValue(50, 10)).toBeLessThan(0.0001);
  });
  it('regression and its errors', () => {
    expect(regression([1, 2, 3, 4], [2, 4, 6, 8.5])).toMatchObject({ n: 4 });
    expect(() => regression([1, 2], [1, 2])).toThrow(/at least 3/);
    expect(() => regression([1, 2, 3], [1, 2])).toThrow(/equal-length/);
  });
  it('sample size for each confidence level and a bad one', () => {
    expect(sampleSize(0.05)).toBe(385);
    expect(sampleSize(0.05, 0.99)).toBeGreaterThan(385);
    expect(sampleSize(0.05, 0.9, 0.3)).toBeGreaterThan(0);
    expect(() => sampleSize(0.05, 0.5)).toThrow(/Confidence/);
  });
});

describe('mathTools: units, dates, money', () => {
  it('converts lengths, temperatures and rejects unknown or mixed units', () => {
    expect(convertUnits(1, 'km', 'm')).toBe(1000);
    expect(convertUnits(100, 'C', 'F')).toBe(212);
    expect(convertUnits(32, 'F', 'K')).toBeCloseTo(273.15, 2);
    expect(convertUnits(0, 'K', 'C')).toBeCloseTo(-273.15, 2);
    expect(convertUnits(0, 'C', 'K')).toBeCloseTo(273.15, 2);
    expect(convertUnits(212, 'F', 'C')).toBe(100);
    expect(() => convertUnits(1, 'parsec', 'm')).toThrow(/Unknown unit: parsec/);
    expect(() => convertUnits(1, 'm', 'zorp')).toThrow(/Unknown unit: zorp/);
    expect(() => convertUnits(1, 'kg', 'm')).toThrow(/Cannot convert mass to length/);
  });
  it('date maths: add days, difference, weekday and bad input', () => {
    expect(dateMath({ from: '2026-01-31', add_days: 1 })).toMatchObject({ date: '2026-02-01' });
    expect(dateMath({ from: '2026-01-01', to: '2026-01-15' })).toEqual({ days: 14, weeks: 2 });
    expect(dateMath({ from: '2026-11-13' })).toEqual({ weekday: 'Friday' });
    expect(() => dateMath({ from: '13/11/2026' })).toThrow(/YYYY-MM-DD/);
  });
  it('time value of money solves each unknown', () => {
    expect(tvm({ pv: -1000, rate: 0.05, nper: 10, pmt: 0 }).fv).toBeCloseTo(1628.8946, 3);
    expect(tvm({ fv: 1628.8946, rate: 0.05, nper: 10, pmt: 0 }).pv).toBeCloseTo(-1000, 2);
    expect(tvm({ pv: -1000, fv: 0, rate: 0.01, nper: 12 }).pmt).toBeGreaterThan(0);
    expect(tvm({ pv: -1000, fv: 0, rate: 0, nper: 10 }).pmt).toBe(100);
    expect(tvm({ pv: -1000, fv: 1628.8946, rate: 0.05, pmt: 0 }).nper).toBeCloseTo(10, 2);
    expect(tvm({ pv: -1000, fv: 1000, rate: 0, pmt: 100 }).nper).toBe(0);
    expect(tvm({ pv: -1000, fv: 1628.8946, nper: 10, pmt: 0 }).rate).toBeCloseTo(0.05, 4);
    expect(tvm({ pv: 0, rate: 0, nper: 10, pmt: 1 }).fv).toBe(-10);
    expect(() => tvm({ pv: 1 })).toThrow(/exactly one/);
    expect(() => tvm({ pv: 1000, fv: 1000, pmt: 0, nper: 5 })).toThrow(/No rate found/);
  });
});

describe('mathTools: everyday maths', () => {
  it('solves linear, quadratic (all three kinds) and systems, with errors', () => {
    expect(solveEquation({ type: 'linear', a: 2, b: -4 })).toMatchObject({ x: 2 });
    expect(() => solveEquation({ type: 'linear', a: 0, b: 1 })).toThrow(/cannot be 0/);
    expect(solveEquation({ type: 'quadratic', a: 1, b: -3, c: 2 })).toMatchObject({ roots: [1, 2], kind: 'two real roots' });
    expect(solveEquation({ type: 'quadratic', a: 1, b: -2, c: 1 })).toMatchObject({ kind: 'one repeated root', roots: [1] });
    expect(solveEquation({ type: 'quadratic', a: 1, b: 0, c: 1 })).toMatchObject({ kind: 'two complex roots' });
    expect(() => solveEquation({ type: 'quadratic', a: 0, b: 1, c: 1 })).toThrow(/cannot be 0/);
    expect(solveEquation({ type: 'system', a1: 1, b1: 1, c1: 3, a2: 1, b2: -1, c2: 1 })).toMatchObject({ x: 2, y: 1 });
    expect(() => solveEquation({ type: 'system', a1: 1, b1: 1, c1: 3, a2: 2, b2: 2, c2: 6 })).toThrow(/parallel/);
    expect(() => solveEquation({ type: 'cubic' })).toThrow(/linear, quadratic or system/);
  });
  it('number operations and their errors', () => {
    expect(numberOps({ op: 'gcd', a: 12, b: 18 })).toEqual({ gcd: 6 });
    expect(numberOps({ op: 'lcm', a: 4, b: 6 })).toEqual({ lcm: 12 });
    expect(numberOps({ op: 'factorial', n: 5 })).toEqual({ factorial: 120 });
    expect(() => numberOps({ op: 'factorial', n: 171 })).toThrow(/0 to 170/);
    expect(numberOps({ op: 'choose', n: 5, k: 2 })).toEqual({ combinations: 10 });
    expect(numberOps({ op: 'choose', n: 3, k: 5 })).toEqual({ combinations: 0 });
    expect(numberOps({ op: 'permute', n: 5, k: 2 })).toEqual({ permutations: 20 });
    expect(numberOps({ op: 'permute', n: 2, k: 5 })).toEqual({ permutations: 0 });
    expect(numberOps({ op: 'prime_factors', n: 60 })).toMatchObject({ factors: [2, 2, 3, 5] });
    expect(() => numberOps({ op: 'prime_factors', n: 1 })).toThrow(/2 or more/);
    expect(numberOps({ op: 'is_prime', n: 13 })).toMatchObject({ prime: true });
    expect(numberOps({ op: 'is_prime', n: 15 })).toMatchObject({ prime: false, smallestFactor: 3 });
    expect(numberOps({ op: 'is_prime', n: 1 })).toEqual({ prime: false });
    expect(() => numberOps({ op: 'gcd', a: 1.5, b: 2 })).toThrow(/whole number/);
    expect(() => numberOps({ op: 'nope' })).toThrow(/op must be/);
  });
  it('percent operations', () => {
    expect(percentOps({ op: 'change', from: 50, to: 75 })).toMatchObject({ percentChange: 50 });
    expect(() => percentOps({ op: 'change', from: 0, to: 5 })).toThrow(/cannot be 0/);
    expect(percentOps({ op: 'of', percent: 15, value: 240 })).toEqual({ result: 36 });
    expect(percentOps({ op: 'what_percent', part: 1, whole: 4 })).toEqual({ percent: 25 });
    expect(() => percentOps({ op: 'what_percent', part: 1, whole: 0 })).toThrow(/cannot be 0/);
    expect(() => percentOps({ op: 'x' })).toThrow(/op must be/);
  });
  it('geometry for every shape and its errors', () => {
    expect(geometry({ shape: 'circle', r: 1 })).toMatchObject({ area: 3.141593 });
    expect(geometry({ shape: 'rectangle', w: 3, h: 4 })).toMatchObject({ area: 12, diagonal: 5 });
    expect(geometry({ shape: 'triangle', base: 4, height: 3 })).toEqual({ area: 6 });
    expect(geometry({ shape: 'triangle', a: 3, b: 4, c: 5 })).toMatchObject({ area: 6, perimeter: 12 });
    expect(() => geometry({ shape: 'triangle', a: 1, b: 1, c: 5 })).toThrow(/cannot make a triangle/);
    expect(geometry({ shape: 'right_triangle', a: 3, b: 4 })).toMatchObject({ hypotenuse: 5 });
    expect(geometry({ shape: 'sphere', r: 1 })).toMatchObject({ volume: 4.18879 });
    expect(geometry({ shape: 'cylinder', r: 1, h: 2 })).toMatchObject({ volume: 6.283185 });
    expect(geometry({ shape: 'cone', r: 3, h: 4 })).toMatchObject({ slantHeight: 5 });
    expect(() => geometry({ shape: 'circle', r: -1 })).toThrow(/negative/);
    expect(() => geometry({ shape: 'hexagon' })).toThrow(/shape must be/);
  });
  it('fractions', () => {
    expect(fractionOps({ op: 'add', a: '1/2', b: '1/3' })).toMatchObject({ fraction: '5/6' });
    expect(fractionOps({ op: 'subtract', a: '1/2', b: '1/3' })).toMatchObject({ fraction: '1/6' });
    expect(fractionOps({ op: 'multiply', a: '2/3', b: '3/4' })).toMatchObject({ fraction: '1/2' });
    expect(fractionOps({ op: 'divide', a: '1/2', b: '1/4' })).toMatchObject({ fraction: '2' });
    expect(fractionOps({ op: 'simplify', a: '6/8' })).toMatchObject({ fraction: '3/4' });
    expect(fractionOps({ op: 'add', a: '7/2', b: '1' })).toMatchObject({ mixed: '4 1/2' });
    expect(fractionOps({ op: 'divide', a: '1', b: '-2' })).toMatchObject({ fraction: '-1/2' });
    expect(() => fractionOps({ op: 'divide', a: '1/2', b: '0' })).toThrow(/divide by zero/);
    expect(() => fractionOps({ op: 'simplify', a: '1/0' })).toThrow(/denominator/);
    expect(() => fractionOps({ op: 'simplify', a: 'x' })).toThrow(/Not a fraction/);
    expect(() => fractionOps({ op: 'pow', a: '1' })).toThrow(/op must be/);
  });
});

describe('mathTools: the tutor entry point', () => {
  it('routes every action and reports bad input clearly', () => {
    expect(run({ action: 'describe', values: '1, 2, 3' }).mean).toBe(2);
    expect(run({ action: 't_test', values: [1, 2, 3, 4], second: [5, 6, 7, 9] }).kind).toBe('welch two-sample');
    expect(run({ action: 't_test', values: [1, 2, 3, 4], mu0: 2 }).kind).toBe('one-sample');
    expect(run({ action: 'regression', x: '1 2 3 4', y: '2 4 6 8.5' }).n).toBe(4);
    expect(run({ action: 'sample_size', margin: 0.05 }).n).toBe(385);
    expect(run({ action: 'convert', value: 1, from: 'km', to: 'm' })).toEqual({ value: 1000, unit: 'm' });
    expect(run({ action: 'date', from: '2026-01-01', to: '2026-01-08' }).days).toBe(7);
    expect(run({ action: 'tvm', pv: -100, rate: 0.1, nper: 1, pmt: 0 }).fv).toBeCloseTo(110, 3);
    expect(run({ action: 'number', input: '{"op":"gcd","a":12,"b":8}' }).gcd).toBe(4);
    expect(run({ action: 'solve', input: { type: 'linear', a: 1, b: -1 } }).x).toBe(1);
    expect(() => studyMath({ action: 'number', input: 'not json' })).toThrow(/valid JSON/);
    expect(() => studyMath({ action: 'describe', values: '' })).toThrow(/at least one number/);
    expect(() => studyMath({ action: 'describe', values: 'a b' })).toThrow(/Not a number/);
    expect(() => studyMath({ action: 'fly' })).toThrow(/action must be/);
  });
});

describe('mathTools: the safe expression evaluator', () => {
  it.each([
    ['2 + 3 * 4', 14], ['(2 + 3) * 4', 20], ['2 ^ 3 ^ 2', 512], ['-3 + 5', 2], ['+4', 4], ['50%', 0.5], ['200 * 5%', 10], ['1,000 + 1', 1001],
    ['$12 × 3', 36], ['10 ÷ 4', 2.5], ['8 − 3', 5], ['pi', Math.PI], ['e', Math.E], ['sqrt(16)', 4], ['abs(-2)', 2], ['log(1000)', 3], ['1.5e2', 150], ['.5 + .25', 0.75],
  ])('%s = %s', (text, expected) => expect(evalExpression(text as string)).toBeCloseTo(expected as number, 6));
  it.each(['', 'alert(1)', '2 +', '(1 + 2', 'sqrt 4', 'foo(2)', '1/0', 'a'.repeat(300), '2 $$ 3x'])('refuses %p', (text) => expect(() => evalExpression(text)).toThrow());
});
