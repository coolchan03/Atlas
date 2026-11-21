import { parseTypedNumber } from '../../../src/topics/typedNumber';

describe('parseTypedNumber', () => {
  it.each([
    ['4500', 4500], ['4,500.4', 4500.4], ['4 500', 4500], ['-3', -3], ['+3', 3], ['0', 0], ['0.5', 0.5], ['.5', 0.5],
    ['1.2e-3', 0.0012], ['1E3', 1000], ['1.2 x 10^5', 120000], ['1.2×10^-3', 0.0012], ['-2.5e2', -250],
    ['$1,250.50', 1250.5], ['-$1,250.50', -1250.5], ['$-1,250.50', -1250.5], ['−5', -5], ['(1,200)', -1200], ['($5)', -5],
    ['12%', 12], ['12 %', 12],
  ])('reads %s as %d', (text, value) => { expect(parseTypedNumber(text)).toBeCloseTo(value as number, 10); });

  it('drops the task\'s own unit but not other text', () => {
    expect(parseTypedNumber('4500 USD', 'USD')).toBe(4500);
    expect(parseTypedNumber('4500 usd', 'USD')).toBe(4500);
    expect(parseTypedNumber('4500 EUR', 'USD')).toBeNull();
  });

  it.each(['', '   ', 'hello', 'hello world', 'abc', 'twelve', 'e', '-', '.', '--5', '+-5', '$$5', '5abc10', '5 5', '1,2,3', '1..2', '5-10', '1e', 'NaN', 'Infinity', '1e999', '(', '5)', '0x10', '1_000'])(
    'rejects %j instead of turning it into a number', (text) => { expect(parseTypedNumber(text)).toBeNull(); });

  it('text that is not a number can never match an answer of zero', () => {
    expect(parseTypedNumber('anything at all')).toBeNull(); // the old reader returned 0 here, so any junk was "correct" for an answer of 0
    expect(parseTypedNumber('0')).toBe(0);
    expect(parseTypedNumber('-0')).toBe(0);
  });
});
