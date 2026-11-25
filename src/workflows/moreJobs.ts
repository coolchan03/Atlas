/**
 * Four more everyday jobs on the workflow engine. In each, the AI suggests and plain code does the arithmetic and the checking:
 * a monthly budget (exact sums, never the AI's), a study plan (code spreads the topics over the days), a week of dinners with one
 * merged shopping list, and a decision helper (code adds up the weights). The person approves before a note is made.
 */
import { extractJson, type Ask, type Workflow } from './engine';
import { list, missingItems, section, text } from './helpers';
import { readFoodFromPhoto } from './photoList';

const json = (reply: string): Record<string, any> => {
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The AI did not answer in the expected form. Try again, or use a larger model.');
  return parsed as Record<string, any>;
};
const askJson = async (ask: Ask, system: string, user: string): Promise<Record<string, any>> => json(await ask(system, user.slice(0, 6000)));
const cents = (n: number): string => `$${(n / 100).toFixed(2)}`;
const amountCents = (v: unknown): number => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

// ------------------------------------------------------------------ monthly budget
export interface BudgetCtx { income: number; lines: Array<{ name: string; cents: number }>; trims?: string[]; leftover?: number; note?: string }

/** One "name: amount" per line (also "name - 120" or "name 120"); lines without an amount are ignored. Pure. */
export function parseBudgetLines(textIn: string): Array<{ name: string; cents: number }> {
  return textIn.split(/\n+/).flatMap((line) => {
    const m = /^(.*?)[\s:=-]+\$?(-?\d[\d,]*(?:\.\d{1,2})?)\s*$/.exec(line.trim());
    return m && m[1].trim() ? [{ name: m[1].trim().slice(0, 40), cents: amountCents(m[2]) }] : [];
  });
}

export const budget: Workflow<BudgetCtx> = {
  id: 'budget',
  title: 'Monthly budget',
  summary: 'List what you spend each month. Code adds it up exactly, shows what is left against your income, and the AI suggests where to trim.',
  input: { help: 'One cost per line with its amount, for example "Rent 1200", "Groceries 450".', minChars: 8,
    fields: [{ id: 'income', label: 'Monthly income after tax', placeholder: 'for example: 3800' }],
    make: (t, f) => ({ income: amountCents(f.income), lines: parseBudgetLines(t) }) },
  steps: [
    { kind: 'code', id: 'check', title: 'Add it up', run: (ctx) => {
      if (ctx.lines.length < 2) throw new Error('List at least two costs, each with an amount.');
      if (ctx.income <= 0) throw new Error('Say your monthly income.');
      return { leftover: ctx.income - ctx.lines.reduce((n, l) => n + l.cents, 0) };
    } },
    { kind: 'model', id: 'trim', title: 'Look for savings', run: async (ctx, ask) => {
      const j = await askJson(ask, 'You help people trim a household budget. Reply with JSON only: {"ideas":["up to 4 specific, realistic ways to spend less, naming the line they come from"]}. Use only the lines given; never invent costs.', ctx.lines.map((l) => `${l.name}: ${cents(l.cents)}`).join('\n'));
      return { trims: list(j.ideas, (s) => text(s, 200) || null, 4) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => `Income ${cents(ctx.income)}\n${ctx.lines.map((l) => `- ${l.name}: ${cents(l.cents)}`).join('\n')}\nSpending ${cents(ctx.lines.reduce((n, l) => n + l.cents, 0))}\n${(ctx.leftover ?? 0) >= 0 ? `Left over: ${cents(ctx.leftover ?? 0)}` : `Over budget by ${cents(-(ctx.leftover ?? 0))}`}\n\nIdeas:\n${(ctx.trims ?? []).map((t) => `- ${t}`).join('\n') || '- None'}` },
    { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => ({ note: `# Monthly budget\n\nIncome: ${cents(ctx.income)}\n\n${section('Spending', ctx.lines.map((l) => `- ${l.name}: ${cents(l.cents)}`))}Left over: ${cents(ctx.leftover ?? 0)}\n\n${section('Ways to spend less', (ctx.trims ?? []).map((t) => `- ${t}`))}` }) },
  ],
};

// ------------------------------------------------------------------ study plan
export interface StudyPlanCtx { topics: string[]; days: number; perDay: number; plan?: Array<{ day: number; topics: string[] }>; note?: string }

/** Spreads topics over the days in order, as evenly as possible, with the last day kept for review. Pure. */
export function spreadTopics(topics: string[], days: number): Array<{ day: number; topics: string[] }> {
  const studyDays = Math.max(1, days > 2 ? days - 1 : days);
  const out = Array.from({ length: studyDays }, (_, i) => ({ day: i + 1, topics: [] as string[] }));
  topics.forEach((t, i) => out[Math.min(studyDays - 1, Math.floor((i * studyDays) / topics.length))].topics.push(t));
  return days > 2 ? [...out, { day: days, topics: ['Review everything, redo what you missed'] }] : out;
}

export const studyPlan: Workflow<StudyPlanCtx> = {
  id: 'studyplan',
  title: 'Study plan',
  summary: 'List the topics and how many days you have. Code spreads them over the days in order and keeps the last day for review.',
  input: { help: 'One topic per line.', minChars: 6,
    fields: [{ id: 'days', label: 'Days until the exam', options: ['3', '5', '7', '14', '21', '30'] }, { id: 'minutes', label: 'Minutes per day', options: ['30', '60', '90', '120'] }],
    make: (t, f) => ({ topics: t.split(/\n+|;/).map((x) => x.trim()).filter(Boolean).slice(0, 80), days: Number(f.days) || 7, perDay: Number(f.minutes) || 60 }) },
  steps: [
    { kind: 'code', id: 'spread', title: 'Spread the topics', run: (ctx) => {
      if (ctx.topics.length < 2) throw new Error('List at least two topics.');
      return { plan: spreadTopics(ctx.topics, ctx.days) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => `${(ctx.plan ?? []).map((d) => `Day ${d.day}: ${d.topics.join('; ')}`).join('\n')  }\n\nAbout ${ctx.perDay} minutes a day.` },
    { kind: 'code', id: 'note', title: 'Make the checklist', run: (ctx) => ({ note: `# Study plan (${ctx.days} days, about ${ctx.perDay} minutes a day)\n\n${(ctx.plan ?? []).map((d) => `## Day ${d.day}\n${d.topics.map((t) => `- [ ] ${t}`).join('\n')}\n`).join('\n')}` }) },
  ],
};

// ------------------------------------------------------------------ week of dinners and one shopping list
interface Dinner { day: string; meal: string; items: string[] }
export interface MealWeekCtx { likes: string; diners: number; avoid: string; pantry: string[]; dinners?: Dinner[]; shopping?: string[]; note?: string }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** All ingredients of the week as one list: the same item (any case, plural or not) once, in the order first needed. Pure. */
export function mergeShopping(dinners: Dinner[]): string[] {
  const seen = new Map<string, string>();
  for (const d of dinners) for (const item of d.items) {
    const key = item.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(es|s)$/, '');
    if (key && !seen.has(key)) seen.set(key, item.trim());
  }
  return [...seen.values()];
}

export const mealWeek: Workflow<MealWeekCtx> = {
  id: 'mealweek',
  title: 'A week of dinners',
  summary: 'Say what your group likes and cannot eat, and list or photograph what you already have. It plans seven dinners that use what you have first and reuse ingredients, checks them against your avoid list, and makes one shopping list of only what is missing.',
  input: { help: 'What you like, or what is on hand (optional detail is fine).', minChars: 4,
    fromPhoto: { label: 'Or take a photo of your fridge or shelf. The AI names what it sees and puts it in "What you already have" to check and edit. The week uses it first, and the shopping list leaves it out.', read: readFoodFromPhoto, field: 'pantry' },
    fields: [
      { id: 'diners', label: 'How many people', options: ['1', '2', '4', '6'] },
      { id: 'pantry', label: 'What you already have (optional)', placeholder: 'for example: eggs, rice, spinach' },
      { id: 'avoid', label: 'Cannot or will not eat (optional)', placeholder: 'for example: peanuts, shellfish' },
    ],
    make: (t, f) => ({ likes: t, diners: Number(f.diners) || 2, avoid: f.avoid ?? '', pantry: (f.pantry ?? '').split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 40) }) },
  steps: [
    { kind: 'model', id: 'plan', title: 'Plan seven dinners', run: async (ctx, ask) => {
      const j = await askJson(ask, `You plan simple home dinners for ${ctx.diners} people. Reply with JSON only: {"dinners":[{"meal":"","items":["each ingredient to buy or use"]}]} with exactly 7 dinners that reuse ingredients across the week. Never include: ${ctx.avoid || 'nothing in particular'}. Cook meat to a safe temperature.${ctx.pantry.length ? ` The person already has: ${ctx.pantry.join(', ')}. Use those first, and list as items only what they would still need to buy besides those.` : ''}`, ctx.likes);
      const dinners = list(j.dinners, (d): Dinner | null => (text(d?.meal, 80) ? { day: '', meal: text(d.meal, 80), items: list(d?.items, (x) => text(x, 60) || null, 15) } : null), 7).map((d, i) => ({ ...d, day: DAYS[i % 7] }));
      if (dinners.length < 3) throw new Error('Too few dinners came back. Try again.');
      const avoid = ctx.avoid.toLowerCase().split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.length > 2);
      const bad = dinners.filter((d) => avoid.some((a) => `${d.meal} ${d.items.join(' ')}`.toLowerCase().includes(a)));
      if (bad.length) throw new Error(`${bad.map((d) => d.meal).join(', ')} includes something you said to avoid. Nothing was used. Try again.`);
      // What is already on hand never goes on the shopping list, whatever the AI listed.
      return { dinners, shopping: ctx.pantry.length ? missingItems(ctx.pantry, mergeShopping(dinners)) : mergeShopping(dinners) };
    } },
    { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => `${(ctx.dinners ?? []).map((d) => `${d.day}: ${d.meal}`).join('\n')}\n\n${ctx.pantry.length ? `Already on hand: ${ctx.pantry.join(', ')}\n\n` : ''}Shopping list (${ctx.shopping?.length ?? 0} items):\n${(ctx.shopping ?? []).map((s) => `- ${s}`).join('\n')}` },
    { kind: 'code', id: 'note', title: 'Make the list', run: (ctx) => ({ note: `# Dinners for the week (${ctx.diners} people)\n\n${section('Dinners', (ctx.dinners ?? []).map((d) => `- ${d.day}: ${d.meal}`))}${section('Shopping list', (ctx.shopping ?? []).map((s) => `- [ ] ${s}`))}` }) },
  ],
};

// ------------------------------------------------------------------ decision helper
interface Option { name: string; pros: Array<{ text: string; weight: number }>; cons: Array<{ text: string; weight: number }>; score?: number }
export interface DecisionCtx { question: string; options?: Option[]; winner?: string; note?: string }

/** Pros add and cons subtract, each weighted 1 to 5; the highest total wins. Pure, so the AI never does the sum. */
export function scoreOptions(options: Option[]): Option[] {
  return options.map((o) => ({ ...o, score: o.pros.reduce((n, p) => n + p.weight, 0) - o.cons.reduce((n, c) => n + c.weight, 0) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export const decision: Workflow<DecisionCtx> = {
  id: 'decision',
  title: 'Decision helper',
  summary: 'Describe a choice. The AI lists pros and cons for each option and weights them 1 to 5; code adds them up, so the ranking is arithmetic, not opinion.',
  input: { help: 'Say the choice and the options, for example: "Take the new job in Denver or stay where I am".', minChars: 15, make: (t) => ({ question: t }) },
  steps: [
    { kind: 'model', id: 'weigh', title: 'List pros and cons', run: async (ctx, ask) => {
      const w = (v: unknown) => Math.max(1, Math.min(5, Math.round(Number(v) || 3)));
      const side = (v: unknown) => list(v, (x) => (text(x?.text, 120) ? { text: text(x.text, 120), weight: w(x?.weight) } : null), 5);
      const j = await askJson(ask, 'You help people weigh a decision. Reply with JSON only: {"options":[{"name":"","pros":[{"text":"","weight":1-5}],"cons":[{"text":"","weight":1-5}]}]}. Give 2 to 4 options named in the question, each with up to 5 pros and cons. Use only facts the person gave or obvious ones; never invent figures.', ctx.question);
      const options = list(j.options, (o): Option | null => (text(o?.name, 60) ? { name: text(o.name, 60), pros: side(o?.pros), cons: side(o?.cons) } : null), 4);
      if (options.length < 2) throw new Error('The AI found fewer than two options. Name them in the question.');
      const ranked = scoreOptions(options);
      return { options: ranked, winner: ranked[0].name };
    } },
    { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => `${(ctx.options ?? []).map((o) => `${o.name}: ${o.score} points\n${o.pros.map((p) => `  + ${p.text} (${p.weight})`).join('\n')}\n${o.cons.map((c) => `  - ${c.text} (${c.weight})`).join('\n')}`).join('\n\n')}\n\nHighest total: ${ctx.winner}. This is a way to see your reasoning, not a verdict: change a weight if it does not match how you feel.` },
    { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => ({ note: `# Decision: ${ctx.question.slice(0, 80)}\n\n${(ctx.options ?? []).map((o) => `## ${o.name} (${o.score} points)\n${o.pros.map((p) => `- Pro (${p.weight}): ${p.text}`).join('\n')}\n${o.cons.map((c) => `- Con (${c.weight}): ${c.text}`).join('\n')}\n`).join('\n')}` }) },
  ],
};
