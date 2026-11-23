/**
 * Arithmetic for the helpers you write: a "calc:" step works out a number with code, never with the AI, so a total or a conversion is
 * exact. An expression uses numbers, + - * / % ^, brackets, the functions round(x, digits), min, max, abs and sqrt, and {Name} for
 * a field you filled in or a calc worked out earlier. It is read by a small parser (no eval), so nothing else can run.
 */
type Token = { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'fn'; v: string } | { t: 'op'; v: string };
const FUNCTIONS: Record<string, (a: number[]) => number> = {
  round: ([x, d = 0]) => { const f = 10 ** Math.max(0, Math.min(8, Math.trunc(d))); return Math.round(x * f) / f; },
  min: (a) => Math.min(...a), max: (a) => Math.max(...a), abs: ([x]) => Math.abs(x), sqrt: ([x]) => Math.sqrt(x),
};

function tokens(source: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const num = /^\d+(?:\.\d+)?|^\.\d+/.exec(source.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    if (c === '{') {
      const end = source.indexOf('}', i);
      if (end < 0) throw new Error('A { has no closing }.');
      const name = source.slice(i + 1, end).trim().toLowerCase();
      if (!name) throw new Error('A {} has no name in it.');
      out.push({ t: 'name', v: name }); i = end + 1; continue;
    }
    const word = /^[a-z]+/i.exec(source.slice(i));
    if (word) {
      const fn = word[0].toLowerCase();
      if (!FUNCTIONS[fn]) throw new Error(`"${word[0]}" is not a function (use round, min, max, abs or sqrt).`);
      out.push({ t: 'fn', v: fn }); i += word[0].length; continue;
    }
    if ('+-*/%^(),'.includes(c)) { out.push({ t: 'op', v: c }); i += 1; continue; }
    throw new Error(`"${c}" cannot be used in a calculation.`);
  }
  return out;
}

type Node = (vars: Record<string, number>) => number;

/** Reads the expression once. Throws a plain sentence when it is not valid. */
function parse(source: string): { run: Node; names: string[] } {
  const list = tokens(source);
  const names = new Set<string>();
  let pos = 0;
  const peek = () => list[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const take = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}".`); pos += 1; };

  function expression(): Node {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const plus = (list[pos++] as { v: string }).v === '+'; const l = left; const r = term();
      left = (v) => (plus ? l(v) + r(v) : l(v) - r(v));
    }
    return left;
  }
  function term(): Node {
    let left = power();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (list[pos++] as { v: string }).v; const l = left; const r = power();
      left = (v) => {
        const a = l(v); const b = r(v);
        if (op === '*') return a * b;
        if (b === 0) throw new Error('The calculation divides by zero.');
        return op === '/' ? a / b : a % b;
      };
    }
    return left;
  }
  function power(): Node {
    const base = unary();
    if (!isOp('^')) return base;
    pos += 1;
    const exponent = power(); // right to left: 2^3^2 is 2^(3^2)
    return (v) => base(v) ** exponent(v);
  }
  function unary(): Node {
    if (isOp('-')) { pos += 1; const inner = unary(); return (v) => -inner(v); }
    return primary();
  }
  function primary(): Node {
    const tok = list[pos];
    if (!tok) throw new Error('The calculation ends too soon.');
    pos += 1;
    if (tok.t === 'num') return () => tok.v;
    if (tok.t === 'name') { names.add(tok.v); return (v) => v[tok.v]; }
    if (tok.t === 'fn') {
      take('(');
      const args: Node[] = [expression()];
      while (isOp(',')) { pos += 1; args.push(expression()); }
      take(')');
      return (v) => FUNCTIONS[tok.v](args.map((a) => a(v)));
    }
    if (tok.v === '(') { const inner = expression(); take(')'); return inner; }
    throw new Error(`Unexpected "${tok.v}".`);
  }

  const root = expression();
  if (pos < list.length) throw new Error(`Unexpected "${(list[pos] as { v: string | number }).v}".`);
  return { run: root, names: [...names] };
}

export type Calculation = { ok: true; names: string[]; evaluate: (vars: Record<string, number>) => number } | { ok: false; error: string };

/** Checks an expression and gives back the names it uses and a function that works it out. Never throws. */
export function compileCalc(source: string): Calculation {
  try {
    const { run, names } = parse(source);
    return {
      ok: true, names,
      evaluate: (vars) => {
        const value = run(vars);
        if (!Number.isFinite(value)) throw new Error('The calculation has no number as its answer (a square root of a negative, or a number too big).');
        return value;
      },
    };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/** A typed value as a number: "$1,200.50" is 1200.5. Null when it is not one (a percent is typed as the plain number, 8 for 8%). */
export function readNumber(text: string): number | null {
  const cleaned = text.trim().replace(/[$€£\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** At most six decimals, no trailing zeros. */
export const showNumber = (n: number): string => String(Number(n.toFixed(6)));
