/**
 * Accountant mode: bank statement text to a categorised CSV that is proven complete.
 * Steps: read the statement (code) -> suggest categories (AI, checked by code) -> ask about the unsure ones ->
 * build the CSV (code) -> reconcile against the statement (code) -> confirm.
 */
import { extractJson, type Ask, type Question, type Workflow } from './engine';
import { parseStatement, reconcile, toCsv, type ParsedStatement, type Reconciliation, type Transaction } from './statement';

const CATEGORIES = ['Income', 'Transfer', 'Groceries', 'Dining', 'Fuel', 'Utilities', 'Rent', 'Insurance', 'Software', 'Shopping', 'Travel', 'Health', 'Fees', 'Taxes', 'Other expense', 'Owner equity'] as const;

export interface AccountantCtx {
  text: string;
  /** The year to use for dates written without one. */
  year: number;
  parsed?: ParsedStatement;
  rows?: Transaction[];
  /** Words the person has categorised before, remembered for next time: lowercase word -> category. */
  rules: Record<string, string>;
  csv?: string;
  reconciliation?: Reconciliation;
}

const ruleKey = (description: string): string => description.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)[0] ?? description.toLowerCase();

/** The category a remembered rule gives this description, if any. */
export function applyRules(description: string, rules: Record<string, string>): string | undefined {
  const lower = description.toLowerCase();
  const hit = Object.keys(rules).find((word) => lower.includes(word));
  return hit ? rules[hit] : undefined;
}

export interface Suggestion { category: string; sure: boolean }

/** The model's category suggestions, kept only when the category is one we know. Anything else stays unsure. */
export function readSuggestions(reply: string, count: number): Array<Suggestion | undefined> {
  const json = extractJson(reply);
  const list = Array.isArray(json) ? json : (json as { rows?: unknown })?.rows;
  const out: Array<Suggestion | undefined> = Array(count).fill(undefined);
  if (!Array.isArray(list)) return out;
  for (const item of list as Array<{ n?: number; category?: string; sure?: boolean }>) {
    const index = Number(item?.n) - 1;
    const category = (CATEGORIES as readonly string[]).find((c) => c.toLowerCase() === String(item?.category ?? '').toLowerCase());
    if (Number.isInteger(index) && index >= 0 && index < count && category) out[index] = { category, sure: item.sure === true };
  }
  return out;
}

async function suggest(rows: Transaction[], rules: Record<string, string>, ask: Ask): Promise<Transaction[]> {
  const result = rows.map((r) => ({ ...r }));
  const unknown: number[] = [];
  result.forEach((r, i) => {
    const known = applyRules(r.description, rules);
    if (known) { r.category = known; r.confident = true; } else unknown.push(i);
  });
  for (let start = 0; start < unknown.length; start += 25) {
    const batch = unknown.slice(start, start + 25);
    const listing = batch.map((index, n) => `${n + 1}. ${result[index].description} (${result[index].cents < 0 ? 'money out' : 'money in'})`).join('\n');
    const reply = await ask(
      `You label bank transactions for a bookkeeper. Choose the best category for each line from this list only: ${CATEGORIES.join(', ')}. Reply with JSON only: [{"n":1,"category":"Groceries","sure":true}]. Set "sure" to false when the name does not tell you what it was. If you cannot even guess, leave the line out.`,
      listing,
    );
    readSuggestions(reply, batch.length).forEach((s, n) => {
      if (s) { result[batch[n]].category = s.category; result[batch[n]].confident = s.sure; }
    });
  }
  return result;
}

export const accountant: Workflow<AccountantCtx> = {
  id: 'accountant',
  title: 'Bank statement to CSV',
  summary: 'Reads a statement, suggests a category for each transaction, asks you about the unsure ones, writes a CSV, and proves nothing is missing.',
  input: { help: 'Paste the text of a bank statement, or choose a file. Include the opening and closing balance so the total can be checked.', minChars: 40,
    make: (text) => ({ text, year: new Date().getFullYear(), rules: {} }) },
  steps: [
    { kind: 'code', id: 'read', title: 'Read the statement', run: (ctx) => {
      const parsed = parseStatement(ctx.text, ctx.year);
      if (!parsed.rows.length) throw new Error('No transactions were found. Each line needs a date and an amount.');
      return { parsed, rows: parsed.rows };
    } },
    { kind: 'model', id: 'suggest', title: 'Suggest categories', run: async (ctx, ask) => ({ rows: await suggest(ctx.rows!, ctx.rules, ask) }) },
    { kind: 'ask', id: 'clarify', title: 'Check the unsure ones',
      questions: (ctx) => (ctx.rows ?? []).flatMap((r, i): Question[] => (r.category && r.confident ? [] : [{
        id: String(i), text: `${r.date}  ${r.description}  ${r.cents < 0 ? '-' : ''}${Math.abs(r.cents / 100).toFixed(2)}${r.category ? `  (suggested: ${r.category})` : ''}`, options: [...CATEGORIES],
      }])),
      apply: (ctx, answers) => {
        const rules = { ...ctx.rules };
        const rows = (ctx.rows ?? []).map((r, i) => {
          const chosen = answers[String(i)];
          if (!chosen) return { ...r, category: r.category ?? 'Other expense', confident: true };
          rules[ruleKey(r.description)] = chosen;
          return { ...r, category: chosen, confident: true };
        });
        return { rows, rules };
      } },
    { kind: 'code', id: 'csv', title: 'Write the CSV', run: (ctx) => ({ csv: toCsv(ctx.rows!) }) },
    { kind: 'code', id: 'reconcile', title: 'Check every transaction is in', run: (ctx) => ({ reconciliation: reconcile(ctx.parsed!, ctx.csv!) }) },
    { kind: 'confirm', id: 'approve', title: 'Approve',
      summary: (ctx) => {
        const r = ctx.reconciliation!;
        const head = r.ok ? `All ${r.counts.parsed} transactions are in the file and the balances add up.` : `Not proven complete:\n- ${r.problems.join('\n- ')}`;
        return `${head}\n\nApprove to keep the CSV (${r.counts.written} rows).`;
      } },
  ],
};
