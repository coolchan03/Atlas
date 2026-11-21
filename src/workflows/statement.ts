/**
 * Bank statement text to a table of transactions, and the checks that every one of them made it into the output.
 * All of this is plain code. A language model may suggest categories (see accountant.ts) but never decides what a
 * transaction is, how much it was, or whether the books balance. Money is whole cents, never floating point.
 */
export interface Transaction { date: string; description: string; cents: number; category?: string; confident?: boolean }
export interface ParsedStatement {
  rows: Transaction[];
  /** Lines that start with a date but have no amount we could read. They are reported, never dropped quietly. */
  unreadable: string[];
  openingCents?: number;
  closingCents?: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = /\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR))?|\(?-?\$?\s?\d+\.\d{2}\)?(?:\s?(?:CR|DR))?/gi;
const DATE_AT_START = /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+[A-Za-z]{3}[a-z]*\.?(?:\s+\d{2,4})?|[A-Za-z]{3}[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{2,4})?)\b/;

/** "$1,234.50", "(45.00)", "-45.00", "45.00 CR", "45.00 DR" to signed cents. Credits are positive, debits negative. */
export function toCents(text: string): number | null {
  const m = text.trim().match(/^(\(?)(-?)\$?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)\)?(?:\s?(CR|DR))?$/i);
  if (!m) return null;
  const value = Math.round(Number(m[3].replace(/,/g, '')) * 100);
  const negative = m[1] === '(' || m[2] === '-' || (m[4] || '').toUpperCase() === 'DR';
  return negative ? -value : value;
}

/** A date as written on the statement to YYYY-MM-DD, taking the year from `year` when the line has none. */
export function toIsoDate(text: string, year: number): string | null {
  const t = text.trim().replace(/\./g, '');
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    return valid(y, Number(m[1]), Number(m[2]));
  }
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*(?:\s+(\d{2,4}))?$/);
  if (m) return valid(m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year, MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
  m = t.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
  if (m) return valid(m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year, MONTHS.indexOf(m[1].toLowerCase()) + 1, Number(m[2]));
  return null;
}

function valid(y: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const hasAmount = (text: string): boolean => [...text.matchAll(AMOUNT)].length > 0;

const OPENING = /(beginning|opening|previous|starting)\s+balance/i;
const CLOSING = /(ending|closing|new|final)\s+balance/i;

function balanceOn(line: string, label: RegExp): number | null {
  if (!label.test(line)) return null;
  const found = line.match(AMOUNT);
  return found ? toCents(found[found.length - 1]) : null;
}

/** Splits a transaction line into its date, description and amount, or null when it has no amount. */
function splitLine(line: string, year: number): { date: string; description: string; amounts: number[] } | null {
  const d = line.match(DATE_AT_START);
  if (!d) return null;
  const date = toIsoDate(d[1], year);
  if (!date) return null;
  const rest = line.slice(d[0].length);
  const found = [...rest.matchAll(AMOUNT)];
  if (!found.length) return null;
  const amounts = found.map((f) => toCents(f[0])).filter((n): n is number => n !== null);
  if (!amounts.length) return null;
  const description = rest.slice(0, found[0].index).replace(/\s+/g, ' ').trim();
  return { date, description, amounts };
}

/** True when the second amount on each line is a running balance (previous balance plus this amount). */
function hasRunningBalance(parts: Array<{ amounts: number[] }>, opening: number | undefined): boolean {
  const two = parts.filter((p) => p.amounts.length >= 2);
  if (two.length < 2 || two.length < parts.length * 0.7) return false;
  let hits = 0;
  let previous = opening;
  for (const p of parts) {
    const [amount, balance] = p.amounts;
    if (p.amounts.length >= 2 && previous !== undefined && previous + amount === balance) hits++;
    if (p.amounts.length >= 2) previous = balance;
  }
  const checkable = previous !== undefined ? two.length : two.length - 1;
  return hits >= Math.max(1, Math.round(checkable * 0.7));
}

/**
 * Reads statement text (pasted, or taken from a PDF or photo by the document reader) into transactions.
 * A line with a date and one amount is a transaction. A line with two amounts is the amount and a running balance
 * when the balances add up, otherwise the last amount is used. A line with no date continues the line above it.
 */
export function parseStatement(text: string, year = new Date().getFullYear()): ParsedStatement {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let openingCents: number | undefined;
  let closingCents: number | undefined;
  const parts: Array<{ date: string; description: string; amounts: number[] }> = [];
  const unreadable: string[] = [];
  // A dated line with no amount waits here: the amount may be on the next, undated line (a wrapped description).
  let pending: string | null = null;
  const flushPending = () => { if (pending !== null) { unreadable.push(pending); pending = null; } };
  for (const line of lines) {
    const open = balanceOn(line, OPENING);
    const close = balanceOn(line, CLOSING);
    if (open !== null) { flushPending(); openingCents = open; continue; }
    if (close !== null) { flushPending(); closingCents = close; continue; }
    const dated = DATE_AT_START.test(line) && toIsoDate(line.match(DATE_AT_START)![1], year) !== null;
    if (dated) {
      flushPending();
      const split = splitLine(line, year);
      if (split) parts.push(split); else pending = line;
      continue;
    }
    if (pending !== null) {
      const joined = splitLine(`${pending} ${line}`, year);
      if (joined) { parts.push(joined); pending = null; continue; }
      pending = `${pending} ${line}`;
      continue;
    }
    // Text under a finished transaction that has no date and no amount continues its description.
    if (parts.length && !hasAmount(line)) parts[parts.length - 1].description = `${parts[parts.length - 1].description} ${line}`.trim();
  }
  flushPending();
  const running = hasRunningBalance(parts, openingCents);
  const rows: Transaction[] = parts.map((p) => ({
    date: p.date, description: p.description, cents: running ? p.amounts[0] : p.amounts[p.amounts.length - 1],
  }));
  return { rows, unreadable, openingCents, closingCents };
}

const csvCell = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (cents: number): string => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** The output file: one row per transaction, in the order they were read. */
export function toCsv(rows: Transaction[]): string {
  const header = 'Date,Description,Amount,Type,Category';
  const body = rows.map((r) => [r.date, r.description, dollars(r.cents), r.cents < 0 ? 'Debit' : 'Credit', r.category ?? 'Uncategorized'].map(csvCell).join(','));
  return `${[header, ...body].join('\n')}\n`;
}

export interface Reconciliation {
  ok: boolean;
  /** Problems, in plain words. Empty when everything lines up. */
  problems: string[];
  /** Rows in the statement, rows in the output file, and the net total in cents. */
  counts: { parsed: number; written: number };
  netCents: number;
}

/** Counts the CSV text back, so "every transaction is in the file" is checked against the file itself. */
export function csvRowCount(csv: string): number {
  let rows = 0;
  let quoted = false;
  let lineHasText = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') quoted = !quoted;
    if (c === '\n' && !quoted) { if (lineHasText) rows++; lineHasText = false; } else if (c !== '\r') lineHasText = true;
  }
  if (lineHasText) rows++;
  return Math.max(0, rows - 1); // the header
}

/**
 * Proves the output is complete: every parsed row is in the file, nothing was unreadable, no row repeats by mistake,
 * and when the statement gives balances, opening plus every amount equals closing, to the cent.
 */
export function reconcile(parsed: ParsedStatement, csv: string): Reconciliation {
  const problems: string[] = [];
  const written = csvRowCount(csv);
  const netCents = parsed.rows.reduce((sum, r) => sum + r.cents, 0);
  if (written !== parsed.rows.length) problems.push(`The file has ${written} rows but the statement had ${parsed.rows.length} transactions.`);
  if (parsed.unreadable.length) problems.push(`${parsed.unreadable.length} line${parsed.unreadable.length === 1 ? '' : 's'} start with a date but have no amount that could be read: ${parsed.unreadable.slice(0, 3).join(' | ')}`);
  if (parsed.openingCents !== undefined && parsed.closingCents !== undefined) {
    const expected = parsed.openingCents + netCents;
    if (expected !== parsed.closingCents) {
      problems.push(`Opening balance ${dollars(parsed.openingCents)} plus the transactions ${dollars(netCents)} is ${dollars(expected)}, but the statement says ${dollars(parsed.closingCents)}. The difference is ${dollars(parsed.closingCents - expected)}, so a transaction is missing, misread or counted twice.`);
    }
  } else {
    problems.push('The statement has no opening and closing balance that could be found, so the total could not be checked against the bank. Add them to the text to prove nothing is missing.');
  }
  const seen = new Map<string, number>();
  for (const r of parsed.rows) seen.set(`${r.date}|${r.description}|${r.cents}`, (seen.get(`${r.date}|${r.description}|${r.cents}`) ?? 0) + 1);
  const repeats = [...seen.entries()].filter(([, n]) => n > 1);
  if (repeats.length) problems.push(`${repeats.length} transaction${repeats.length === 1 ? '' : 's'} appear more than once with the same date, description and amount. That can be real (two coffees), so check them.`);
  return { ok: problems.length === 0, problems, counts: { parsed: parsed.rows.length, written }, netCents };
}
