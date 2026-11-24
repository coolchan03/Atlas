/**
 * A spreadsheet formula evaluator, so a formula the AI writes can be tried on your own sample values before you paste it into a
 * sheet. It reads a formula with a small parser (no eval): numbers, "text", TRUE/FALSE, cell references (B2) and ranges (B2:B9),
 * + - * / ^ & = <> < > <= >=, brackets and the common functions. A formula it cannot read is reported with a plain sentence,
 * which is also what is fed back to the AI for a second try.
 */
export type Cell = number | string | boolean | null;
type Value = Cell | Cell[][];
export type Grid = Cell[][];

const colNumber = (letters: string) => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
class FormulaError extends Error {}
const fail = (m: string): never => { throw new FormulaError(m); };

type Tok = { t: 'num' | 'str' | 'ref' | 'name' | 'op'; v: string };
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < src.length;) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (/\s/.test(rest[0])) { i += 1; continue; }
    if ((m = /^\d+(?:\.\d+)?|^\.\d+/.exec(rest))) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if (rest[0] === '"') {
      const end = rest.indexOf('"', 1);
      if (end < 0) fail('A quote " is never closed.');
      out.push({ t: 'str', v: rest.slice(1, end) }); i += end + 1; continue;
    }
    if ((m = /^\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?(?![\w(])/.exec(rest))) { out.push({ t: 'ref', v: m[0].replace(/\$/g, '').toUpperCase() }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][\w.]*/.exec(rest))) { out.push({ t: 'name', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = /^(<=|>=|<>|[-+*/^&=<>(),%;])/.exec(rest))) { out.push({ t: 'op', v: m[0] === ';' ? ',' : m[0] }); i += m[0].length; continue; }
    fail(`"${rest[0]}" cannot be used in a formula.`);
  }
  return out;
}

const flat = (v: Value): Cell[] => (Array.isArray(v) ? v.flat() : [v]);
const num = (v: Value): number => {
  const x = Array.isArray(v) ? v[0]?.[0] ?? null : v;
  if (x === null || x === '') return 0;
  if (typeof x === 'boolean') return x ? 1 : 0;
  const n = typeof x === 'number' ? x : Number(String(x).replace(/[$€£,\s]/g, ''));
  if (!Number.isFinite(n)) return fail(`"${x}" is not a number.`);
  return n;
};
const numbers = (args: Value[]): number[] => args.flatMap((a) => (Array.isArray(a) ? flat(a).filter((c) => typeof c === 'number') as number[] : [num(a)]));
const text = (v: Value): string => { const x = Array.isArray(v) ? v[0]?.[0] ?? null : v; return x === null ? '' : typeof x === 'boolean' ? (x ? 'TRUE' : 'FALSE') : String(x); };
const truthy = (v: Value): boolean => { const x = Array.isArray(v) ? v[0]?.[0] ?? null : v; return typeof x === 'string' ? x.toUpperCase() === 'TRUE' : !!x; };

/** Does a cell meet a criterion like ">5", "<>paid", "=x" or plain text? */
function meets(cell: Cell, crit: Value): boolean {
  const c = Array.isArray(crit) ? crit[0]?.[0] ?? null : crit;
  if (typeof c !== 'string') return cell === c || (typeof cell === 'string' && cell.toLowerCase() === String(c).toLowerCase());
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(c)!;
  const op = m[1] ?? '='; const want = m[2];
  const wn = Number(want);
  if (want.trim() !== '' && Number.isFinite(wn) && typeof cell === 'number') {
    return op === '=' ? cell === wn : op === '<>' ? cell !== wn : op === '<' ? cell < wn : op === '>' ? cell > wn : op === '<=' ? cell <= wn : cell >= wn;
  }
  const same = String(cell ?? '').toLowerCase() === want.toLowerCase();
  return op === '<>' ? !same : op === '=' ? same : false;
}

const FUNCS: Record<string, (a: Value[]) => Value> = {
  SUM: (a) => numbers(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => { const n = numbers(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : fail('AVERAGE has no numbers to use.'); },
  MIN: (a) => Math.min(...numbers(a)), MAX: (a) => Math.max(...numbers(a)),
  COUNT: (a) => numbers(a).length, COUNTA: (a) => a.flatMap(flat).filter((c) => c !== null && c !== '').length,
  ABS: ([x]) => Math.abs(num(x)), SQRT: ([x]) => (num(x) < 0 ? fail('SQRT of a negative number.') : Math.sqrt(num(x))),
  ROUND: ([x, d = 0]) => { const f = 10 ** Math.max(0, Math.min(8, Math.trunc(num(d)))); return Math.round(num(x) * f) / f; },
  IF: ([c, a, b = false]) => (truthy(c) ? a : b),
  AND: (a) => a.flatMap(flat).every((c) => truthy(c)), OR: (a) => a.flatMap(flat).some((c) => truthy(c)), NOT: ([x]) => !truthy(x),
  LEN: ([x]) => text(x).length, UPPER: ([x]) => text(x).toUpperCase(), LOWER: ([x]) => text(x).toLowerCase(),
  CONCAT: (a) => a.flatMap(flat).map((c) => text(c)).join(''), CONCATENATE: (a) => a.flatMap(flat).map((c) => text(c)).join(''),
  COUNTIF: ([range, crit]) => flat(range).filter((c) => meets(c, crit)).length,
  SUMIF: ([range, crit, sum]) => { const r = flat(range); const s = flat(sum ?? range); return r.reduce<number>((t, c, i) => (meets(c, crit) && typeof s[i] === 'number' ? t + (s[i] as number) : t), 0); },
  AVERAGEIF: ([range, crit, avg]) => {
    const r = flat(range); const s = flat(avg ?? range);
    const hit = r.map((c, i) => (meets(c, crit) && typeof s[i] === 'number' ? (s[i] as number) : null)).filter((x): x is number => x !== null);
    return hit.length ? hit.reduce((x, y) => x + y, 0) / hit.length : fail('AVERAGEIF found no matching numbers.');
  },
};
export const FORMULA_FUNCTIONS = [...Object.keys(FUNCS), 'IFERROR'];

/** The cells of a reference ("B2" or "B2:B9") from the grid; empty places are null. */
function cells(grid: Grid, ref: string): Value {
  const [a, b = a] = ref.split(':');
  const at = (r: string) => { const m = /^([A-Z]+)(\d+)$/.exec(r)!; return { col: colNumber(m[1]) - 1, row: Number(m[2]) - 1 }; };
  const p = at(a); const q = at(b);
  if (p.col === q.col && p.row === q.row && !ref.includes(':')) return grid[p.row]?.[p.col] ?? null;
  const rows: Cell[][] = [];
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r += 1) {
    const row: Cell[] = [];
    for (let c = Math.min(p.col, q.col); c <= Math.max(p.col, q.col); c += 1) row.push(grid[r]?.[c] ?? null);
    rows.push(row);
  }
  return rows;
}

function evaluateTokens(list: Tok[], grid: Grid): Value {
  let pos = 0;
  const peek = () => list[pos];
  const isOp = (...v: string[]) => peek()?.t === 'op' && v.includes(peek().v);
  const take = (v: string) => { if (!isOp(v)) fail(`Expected "${v}".`); pos += 1; };
  const compare = (): Value => {
    let left = concat();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = list[pos++].v; const right = concat();
      const a = Array.isArray(left) ? left[0]?.[0] ?? null : left; const b = Array.isArray(right) ? right[0]?.[0] ?? null : right;
      const both = typeof a === 'number' && typeof b === 'number';
      const [x, y] = both ? [a, b] : [text(a).toLowerCase(), text(b).toLowerCase()];
      left = op === '=' ? x === y : op === '<>' ? x !== y : op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
    }
    return left;
  };
  const concat = (): Value => { let l = add(); while (isOp('&')) { pos += 1; l = text(l) + text(add()); } return l; };
  const add = (): Value => { let l = mul(); while (isOp('+', '-')) { const op = list[pos++].v; const r = mul(); l = op === '+' ? num(l) + num(r) : num(l) - num(r); } return l; };
  const mul = (): Value => {
    let l = pow();
    while (isOp('*', '/')) { const op = list[pos++].v; const r = pow(); if (op === '*') l = num(l) * num(r); else { if (num(r) === 0) fail('The formula divides by zero.'); l = num(l) / num(r); } }
    return l;
  };
  const pow = (): Value => { const b = unary(); if (!isOp('^')) return b; pos += 1; return num(b) ** num(pow()); };
  const unary = (): Value => { if (isOp('-')) { pos += 1; return -num(unary()); } if (isOp('+')) { pos += 1; return unary(); } return percent(); };
  const percent = (): Value => { let v = primary(); while (isOp('%')) { pos += 1; v = num(v) / 100; } return v; };
  /** IFERROR(a, b): a when it works out, else b. The tokens of a failed a are skipped up to its comma. */
  const ifError = (): Value => {
    let first: Value; let failed = false;
    try { first = compare(); } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      failed = true; first = null;
      for (let depth = 0; pos < list.length && !(depth === 0 && isOp(',')); pos += 1) { if (isOp('(')) depth += 1; if (isOp(')')) { if (depth === 0) break; depth -= 1; } }
    }
    take(',');
    const other = compare();
    take(')');
    return failed ? other : first;
  };
  const primary = (): Value => {
    const tok = list[pos++];
    if (!tok) return fail('The formula ends too soon.');
    if (tok.t === 'num') return Number(tok.v);
    if (tok.t === 'str') return tok.v;
    if (tok.t === 'ref') return cells(grid, tok.v);
    if (tok.t === 'name') {
      if (tok.v === 'TRUE') return true;
      if (tok.v === 'FALSE') return false;
      const fn = FUNCS[tok.v];
      if (!fn && tok.v !== 'IFERROR') return fail(`${tok.v} is not a function this checker knows (${FORMULA_FUNCTIONS.join(', ')}).`);
      take('(');
      if (tok.v === 'IFERROR') return ifError();
      const args: Value[] = [];
      if (!isOp(')')) { args.push(compare()); while (isOp(',')) { pos += 1; args.push(compare()); } }
      take(')');
      return fn!(args);
    }
    if (tok.v === '(') { const v = compare(); take(')'); return v; }
    return fail(`Unexpected "${tok.v}".`);
  };
  const result = compare();
  if (pos < list.length) fail(`Unexpected "${list[pos].v}".`);
  return result;
}

export type Evaluation = { ok: true; value: Cell } | { ok: false; error: string };

/** Works out a formula (with or without the leading "=") against sample values. Never throws. */
export function evaluateFormula(formula: string, grid: Grid): Evaluation {
  const source = formula.trim().replace(/^=/, '');
  if (!source) return { ok: false, error: 'The formula is empty.' };
  const run = (): Evaluation => {
    const v = evaluateTokens(tokenize(source), grid);
    const cell = Array.isArray(v) ? v[0]?.[0] ?? null : v;
    if (typeof cell === 'number' && !Number.isFinite(cell)) return { ok: false, error: 'The formula has no number as its answer.' };
    return { ok: true, value: cell };
  };
  try { return run(); } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message };
    return { ok: false, error: 'The formula could not be worked out.' };
  }
}

/** Sample text to a grid: one line per row, cells split on tabs or commas; numbers become numbers. Pure. */
export function parseGrid(textIn: string): Grid {
  return textIn.split(/\r?\n/).filter((l) => l.trim()).slice(0, 200).map((line) => line.split(line.includes('\t') ? '\t' : ',').slice(0, 26).map((raw) => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t.replace(/[$€£]/g, '').replace(/,(?=\d{3}\b)/g, ''));
    return /^[-+]?[$€£]?\d[\d,]*(\.\d+)?$|^[-+]?\.\d+$/.test(t) && Number.isFinite(n) ? n : t;
  }));
}
