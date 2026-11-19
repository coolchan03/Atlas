/**
 * Journal entries as a table: when an assignment asks for one, the learner fills in rows of Account | Debit | Credit (typing the account or
 * picking it from a list) instead of writing it out as a sentence. This turns the rows into text for marking, and finds the account names
 * to offer. Pure, so it is tested without a device.
 */
export interface JournalRow { account: string; debit: string; credit: string }

/** Accounts offered when the task names none, grouped as a chart of accounts would be. */
const STANDARD_ACCOUNTS = [
  'Cash', 'Accounts Receivable', 'Allowance for Doubtful Accounts', 'Inventory', 'Prepaid Expenses', 'Supplies', 'Notes Receivable', 'Investments',
  'Land', 'Buildings', 'Equipment', 'Vehicles', 'Furniture', 'Accumulated Depreciation', 'Intangible Assets',
  'Accounts Payable', 'Notes Payable', 'Wages Payable', 'Interest Payable', 'Taxes Payable', 'Unearned Revenue', 'Bonds Payable', 'Lease Liability',
  "Owner's Capital", "Owner's Drawings", 'Common Stock', 'Retained Earnings', 'Fund Balance', 'Unassigned Fund Balance',
  'Revenue', 'Sales Revenue', 'Service Revenue', 'Interest Revenue', 'Cost of Goods Sold', 'Wages Expense', 'Rent Expense', 'Utilities Expense',
  'Depreciation Expense', 'Interest Expense', 'Supplies Expense', 'Insurance Expense', 'Expenditures', 'Transfers In', 'Transfers Out',
];

/** Whether a task is asking for a journal entry (so the table is shown instead of a blank answer box). */
export const isJournalTask = (...texts: string[]): boolean => {
  const t = texts.join(' ');
  return /\bjournal entr(?:y|ies)\b|\bjournali[sz]e\b|\bmake the entry\b|\brecord (?:the|this|each) (?:transaction|entry|purchase|sale|payment|receipt)\b/i.test(t)
    || (/\b(?:debit|dr\.?)\b/i.test(t) && /\b(?:credit|cr\.?)\b/i.test(t));
};

const SIDE = /(?:\b(?:[Dd]r|[Cc]r|[Dd]ebit|[Cc]redit)\b\.?:?)\s+([A-Z][A-Za-z&/'’()\- ]{1,44}?)(?=\s*(?:[$\d,;:.\n]|$|\b(?:[Dd]r|[Cc]r|[Dd]ebit|[Cc]redit|and|for|to|from|of the)\b))/g;

/** Account names a text uses: those after Dr / Cr / Debit / Credit, and the first cell of table rows. */
export function accountsIn(...texts: string[]): string[] {
  const found: string[] = [];
  const add = (raw: string) => {
    const name = raw.replace(/\([^)]*\)?/g, '').replace(/^(?:to|the|an?)\s+/i, '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
    if (name.length >= 3 && name.length <= 40 && !/^(?:account|debit|credit|amount|date|total)s?$/i.test(name) && !found.some((f) => f.toLowerCase() === name.toLowerCase())) found.push(name);
  };
  for (const text of texts) {
    for (const m of text.matchAll(SIDE)) add(m[1]);
    for (const line of text.split('\n')) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.length >= 2 && /^[A-Za-z]/.test(cells[0]) && !/^[-:\s—–]+$/.test(cells[0])) add(cells[0]);
    }
  }
  return found;
}

/** The accounts to offer for this task: its own first (so the right ones are at hand), then the standard list. */
export const accountPool = (...texts: string[]): string[] => {
  const own = accountsIn(...texts);
  return [...own, ...STANDARD_ACCOUNTS.filter((a) => !own.some((o) => o.toLowerCase() === a.toLowerCase()))];
};

/** Accounts from the pool that match what is being typed (all of them, task accounts first, when nothing is typed yet). */
export function suggest(query: string, pool: string[], limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((a) => a.toLowerCase().startsWith(q));
  const has = pool.filter((a) => !a.toLowerCase().startsWith(q) && a.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  return [...starts, ...has].slice(0, limit);
}

const filled = (r: JournalRow) => r.account.trim() && (r.debit.trim() || r.credit.trim());

/** The entry as lines for marking: the debits first, then the credits with "to" before the account, with the amounts typed. */
export function journalToText(rows: JournalRow[]): string {
  const lines = rows.filter(filled);
  const side = (r: JournalRow, amount: string, debit: boolean) => `${debit ? '' : '    '}${debit ? 'Dr.' : 'Cr.'} ${r.account.trim()}${/\d/.test(amount) ? ` ${amount.trim()}` : ''}`;
  const debits = lines.filter((r) => r.debit.trim()).map((r) => side(r, r.debit, true));
  const credits = lines.filter((r) => r.credit.trim()).map((r) => side(r, r.credit, false));
  return [...debits, ...credits].join('\n');
}

const num = (s: string): number => Number(s.replace(/[$,\s]/g, ''));
/** A quick check the learner can see before marking: do the debit and credit amounts agree? Null when there are no amounts to compare. */
export function balance(rows: JournalRow[]): { debits: number; credits: number; balanced: boolean } | null {
  const amounts = (key: 'debit' | 'credit') => rows.map((r) => num(r[key])).filter((n) => Number.isFinite(n) && n > 0);
  const d = amounts('debit'); const c = amounts('credit');
  if (!d.length && !c.length) return null;
  const debits = d.reduce((a, b) => a + b, 0); const credits = c.reduce((a, b) => a + b, 0);
  return { debits, credits, balanced: d.length > 0 && c.length > 0 && Math.abs(debits - credits) < 0.005 };
}
