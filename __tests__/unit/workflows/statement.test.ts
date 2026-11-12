import { csvRowCount, parseStatement, reconcile, toCents, toCsv, toIsoDate } from '../../../src/workflows/statement';

const STATEMENT = `
Beginning balance $1,000.00
01/03 PAYROLL ACME INC 2,500.00 3,500.00
01/05 GROCERY OUTLET #12 (86.40) 3,413.60
01/07 SHELL OIL 4412
        PORTLAND OR -45.10 3,368.50
01/09 AMAZON MKTPLACE 29.99 DR 3,338.51
Ending balance $3,338.51
`;

describe('bank statement to rows', () => {
  it('reads money as signed cents', () => {
    expect(toCents('$1,234.50')).toBe(123450);
    expect(toCents('(45.00)')).toBe(-4500);
    expect(toCents('-45.00')).toBe(-4500);
    expect(toCents('29.99 DR')).toBe(-2999);
    expect(toCents('29.99 CR')).toBe(2999);
    expect(toCents('abc')).toBeNull();
  });
  it('reads the date styles banks use', () => {
    expect(toIsoDate('01/03', 2026)).toBe('2026-01-03');
    expect(toIsoDate('1/3/25', 2026)).toBe('2025-01-03');
    expect(toIsoDate('2026-02-14', 2026)).toBe('2026-02-14');
    expect(toIsoDate('14 Feb 2026', 2026)).toBe('2026-02-14');
    expect(toIsoDate('Feb 14, 2026', 2026)).toBe('2026-02-14');
    expect(toIsoDate('13/45', 2026)).toBeNull();
  });
  it('takes the amount, not the running balance, joins wrapped descriptions, and finds the balances', () => {
    const parsed = parseStatement(STATEMENT, 2026);
    expect(parsed.rows.map((r) => [r.date, r.cents])).toEqual([
      ['2026-01-03', 250000], ['2026-01-05', -8640], ['2026-01-07', -4510], ['2026-01-09', -2999],
    ]);
    expect(parsed.rows[2].description).toBe('SHELL OIL 4412 PORTLAND OR');
    expect(parsed.openingCents).toBe(100000);
    expect(parsed.closingCents).toBe(333851);
    expect(parsed.unreadable).toEqual([]);
  });
  it('without a running balance column the last amount on the line is the amount', () => {
    const parsed = parseStatement('01/03 RENT 1,200.00\n01/04 COFFEE 4.50', 2026);
    expect(parsed.rows.map((r) => r.cents)).toEqual([120000, 450]);
  });
});

describe('proving nothing was left out', () => {
  it('passes when every row is in the file and the balances add up to the cent', () => {
    const parsed = parseStatement(STATEMENT, 2026);
    const result = reconcile(parsed, toCsv(parsed.rows));
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ parsed: 4, written: 4 });
  });
  it('catches a missing transaction and says by how much the books are off', () => {
    const parsed = parseStatement(STATEMENT.replace('01/05 GROCERY OUTLET #12 (86.40) 3,413.60\n', '01/05 GROCERY OUTLET #12 3,413.60\n'), 2026);
    const result = reconcile(parsed, toCsv(parsed.rows));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/The difference is/);
  });
  it('catches a row that never reached the file', () => {
    const parsed = parseStatement(STATEMENT, 2026);
    const csv = toCsv(parsed.rows.slice(0, 3));
    expect(reconcile(parsed, csv).problems[0]).toMatch(/file has 3 rows but the statement had 4/);
  });
  it('reports a dated line with no readable amount instead of dropping it', () => {
    const parsed = parseStatement('Beginning balance 100.00\n01/03 MYSTERY CHARGE\n01/04 COFFEE 4.50\nEnding balance 104.50', 2026);
    expect(parsed.unreadable).toEqual(['01/03 MYSTERY CHARGE']);
    expect(reconcile(parsed, toCsv(parsed.rows)).problems[0]).toMatch(/no amount that could be read/);
  });
  it('says so when the statement has no balances to check against, and counts quoted commas as one cell', () => {
    const parsed = parseStatement('01/03 SMITH, JOHN LLC 10.00', 2026);
    expect(reconcile(parsed, toCsv(parsed.rows)).problems.join(' ')).toMatch(/no opening and closing balance/);
    expect(csvRowCount(toCsv(parsed.rows))).toBe(1);
  });
});
