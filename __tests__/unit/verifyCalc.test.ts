import { describeChecks, findCalculations } from '../../src/study/verifyCalc';

describe('UX-14 deterministic Verify', () => {
  it('confirms a correct sum and catches a wrong one', () => {
    const r = findCalculations('Tax is 500 * 0.2 = 100, and the total is 120 + 30 = 160.');
    expect(r.map((c) => [c.expression, c.ok])).toEqual([['500 * 0.2', true], ['120 + 30', false]]);
    expect(r[1].computed).toBe(150);
  });
  it('reads money, commas, multiplication signs and percents', () => {
    const r = findCalculations('$1,200 + $300 = $1,500 and 3 × 4 = 12 and 200 * 5% = 10 and 10 / 4 = 2.5');
    expect(r).toHaveLength(4); expect(r.every((c) => c.ok)).toBe(true);
  });
  it('says when it only matches after rounding', () => {
    const r = findCalculations('10 / 3 = 3.33');
    expect(r[0].ok).toBe(false); expect(r[0].roundedOk).toBe(true);
    expect(describeChecks(r)).toMatch(/Matches after rounding/);
    expect(findCalculations('10 / 3 = 3.4')[0].roundedOk).toBe(false);
  });
  it('is honest about its limits, and finds nothing in plain prose', () => {
    expect(describeChecks(findCalculations('2 + 2 = 4'))).toMatch(/does not show that the right formula/);
    expect(findCalculations('Assets equal liabilities plus equity.')).toEqual([]);
    expect(describeChecks([])).toBeNull();
  });
  it('never evaluates anything but arithmetic', () => {
    expect(findCalculations('alert(1) + process.exit() = 3')).toEqual([]);
  });
});

describe('showCodeCheck', () => {
  const { Alert } = require('react-native');
  const { showCodeCheck } = require('../../src/study/verifyCalc');
  it('shows the recomputed result with a way to also ask the AI, and shows nothing for plain prose', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const ask = jest.fn();
    expect(showCodeCheck('So 120 + 30 = 160.', ask)).toBe(true);
    expect(spy.mock.calls[0][1]).toMatch(/Does not match/);
    (spy.mock.calls[0][2] as any[]).find((b) => /ask the AI/.test(b.text)).onPress();
    expect(ask).toHaveBeenCalledTimes(1);
    spy.mockClear();
    expect(showCodeCheck('No numbers worked out here.', ask)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
