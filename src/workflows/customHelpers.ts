/**
 * Multi-step helpers you write yourself. A helper is a title plus a few lines in plain text, one step per line:
 *   field: Tone | Friendly, Formal     a choice asked before it starts (leave out the choices for a typed answer)
 *   ask: Keep it short? | Yes, No      a choice asked part-way through (choices are needed)
 *   ai: Write a reply in that tone.    one AI step: it follows the instruction using the text and your answers
 *   1. Write a reply in that tone.     the same, written as a numbered step ("Step 2: ..." works too): a helper can be just its steps
 *   calc: Total | {Price} * {Qty}      one exact calculation done by code, not the AI (see calc.ts); {Name} is a field or an earlier calc
 * The last AI result is shown for approval, then saved as a note. The AI never sees anything beyond what you give it.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InputField, Workflow } from './engine';
import { compileCalc, readNumber, showNumber } from './calc';
import { digestText, fitsWhole } from './longText';
import { relevantReferences } from '../skills/selectSkills';
import { currentStepBudget, STEP_SYSTEM, stepPrompt } from './stepPrompt';

export interface CustomHelper { /** Text files that came with a skill run as a helper: the parts a step is about are shown to it. */ resources?: Array<{ name: string; text: string }>; id: string; title: string; summary: string; help: string; steps: string; createdAt: number; /** Made by the chat AI (make_helper), so the list can say so. */ madeByAi?: boolean }
interface State { helpers: CustomHelper[]; save: (h: Omit<CustomHelper, 'createdAt'>) => void; remove: (id: string) => void }

export const useCustomHelpers = create<State>()(persist((set) => ({
  helpers: [],
  save: (h) => set((s) => ({ helpers: [{ ...h, createdAt: s.helpers.find((x) => x.id === h.id)?.createdAt ?? Date.now() }, ...s.helpers.filter((x) => x.id !== h.id)].slice(0, 30) })),
  remove: (id) => set((s) => ({ helpers: s.helpers.filter((x) => x.id !== id) })),
}), { name: 'atlas-custom-helpers', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ helpers: s.helpers }) }));

type ParsedStep = { kind: 'ask' | 'ai'; text: string; options?: string[] } | { kind: 'calc'; text: string; label: string; expression: string };
export interface ParsedSteps { fields: InputField[]; steps: ParsedStep[]; errors: string[] }

const choices = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8);

/** Reads the step lines. Anything that is not a step is reported, so a typo is never silently dropped. Pure. */
export function parseSteps(source: string): ParsedSteps {
  const out: ParsedSteps = { fields: [], steps: [], errors: [] };
  source.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    // A plain numbered line ("1. Do this", "Step 2: Do that") is an instruction for the AI, so a helper can be written as just its steps.
    const numbered = /^(?:step\s*)?\d{1,2}\s*[.):-]\s*(.+)$/i.exec(line);
    const m = numbered ? ['', 'ai', numbered[1]] : /^(field|ask|ai|calc)\s*:\s*(.+)$/i.exec(line);
    if (!m) { out.errors.push(`Line ${i + 1} must be a numbered step ("1. Do this") or start with field:, ask:, ai: or calc:`); return; }
    const kind = m[1].toLowerCase();
    const [head, rest] = m[2].split('|').map((x) => x.trim());
    if (kind === 'field') out.fields.push({ id: `f${out.fields.length}`, label: head.slice(0, 60), placeholder: head.slice(0, 60), ...(rest ? { options: choices(rest) } : {}) });
    else if (kind === 'ask') {
      const options = choices(rest ?? '');
      if (options.length < 2) out.errors.push(`Line ${i + 1}: an ask: step needs two or more choices after a |`);
      else out.steps.push({ kind: 'ask', text: head.slice(0, 200), options });
    } else if (kind === 'calc') parseCalcLine(m[2], i + 1, out);
    else out.steps.push({ kind: 'ai', text: m[2].slice(0, 600) });
  });
  if (!out.steps.some((s) => s.kind === 'ai' || s.kind === 'calc')) out.errors.push('Add at least one ai: or calc: step.');
  return out;
}

/** "calc: Total | {Price} * {Qty}": a label and an expression; every {Name} must be a field or a calc written above it. */
function parseCalcLine(rest: string, lineNo: number, out: ParsedSteps): void {
  const bar = rest.indexOf('|');
  const label = (bar < 0 ? '' : rest.slice(0, bar)).trim().slice(0, 40);
  const expression = (bar < 0 ? '' : rest.slice(bar + 1)).trim();
  if (!label || !expression) { out.errors.push(`Line ${lineNo}: a calc: step looks like "calc: Total | {Price} * {Qty}"`); return; }
  const compiled = compileCalc(expression);
  if (!compiled.ok) { out.errors.push(`Line ${lineNo}: ${compiled.error}`); return; }
  const known = new Set([...out.fields.map((f) => f.label.toLowerCase()), ...out.steps.flatMap((s) => (s.kind === 'calc' ? [s.label.toLowerCase()] : []))]);
  const unknown = compiled.names.find((n) => !known.has(n));
  if (unknown) { out.errors.push(`Line ${lineNo}: {${unknown}} is not a field or a calc written above this line`); return; }
  out.steps.push({ kind: 'calc', text: rest.slice(0, 200), label, expression });
}

interface Ctx { /** The text of a long input, read in parts and written down as notes, once, for the steps to work from. */ digest?: string; text: string; fields: Record<string, string>; fieldLabels: string[]; answers: string[]; outputs: string[]; /** Results of calc: steps, as "Label: value" lines, and the same as numbers for the calcs after them. */ calcs: string[]; values: Record<string, number>; note?: string }

/** Turns a written helper into a workflow the engine can run. */
export function toWorkflow(h: CustomHelper): Workflow<Ctx> {
  const parsed = parseSteps(h.steps);
  const steps: Workflow<Ctx>['steps'] = parsed.steps.map((s, i) => (s.kind === 'calc'
    ? calcStep(s, i, parsed.fields)
    : s.kind === 'ask'
    ? { kind: 'ask' as const, id: `ask${i}`, title: s.text, questions: () => [{ id: 'q', text: s.text, options: s.options }], apply: (ctx, a) => ({ answers: [...ctx.answers, `${s.text} ${a.q ?? ''}`] }) }
    : { kind: 'model' as const, id: `ai${i}`, title: s.text.slice(0, 50), run: async (ctx, ask) => {
      const known = [...ctx.fieldLabels.map((label, k) => `${label}: ${ctx.fields[`f${k}`] ?? ''}`), ...ctx.answers, ...ctx.calcs].filter(Boolean).join('\n');
      // A text too long for one prompt is read in parts first (once); every step then works from the notes.
      const budget = currentStepBudget();
      const digest = ctx.digest ?? (fitsWhole(ctx.text, budget) ? undefined : await digestText(jobOf(h.title, parsed.steps), ctx.text, { budget, ask: (system, user) => ask(system, user) }));
      const reply = await ask(STEP_SYSTEM,
        stepPrompt({ instruction: s.text, text: digest ?? ctx.text, known, results: ctx.outputs, budget, references: h.resources?.length ? relevantReferences(`${s.text} ${h.summary}`, h.resources, Math.round(budget * 0.25)) : [] }));
      const result = reply.trim().slice(0, 6000);
      if (!result) throw new Error('The AI gave no answer. Try again.');
      return { outputs: [...ctx.outputs, result], ...(digest ? { digest } : {}) };
    } }));
  return {
    id: `custom-${h.id}`, title: h.madeByAi ? `${h.title} (made by the AI)` : h.title, summary: h.summary || 'A helper you made.',
    input: { help: h.help || 'Paste or type what this helper should work on.', minChars: parsed.steps.some((x) => x.kind === 'ai') ? 1 : 0, fields: parsed.fields,
      make: (t, f) => ({ text: t, fields: f, fieldLabels: parsed.fields.map((x) => x.label), answers: [], outputs: [], calcs: [], values: {} }) },
    steps: [...steps,
      { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => [ctx.calcs.join('\n'), ctx.outputs[ctx.outputs.length - 1]].filter(Boolean).join('\n\n') },
      { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => ({ note: noteFor(h.title, ctx) }) }],
  };
}

/** One exact calculation: reads the numbers typed into the fields (and earlier calcs), works the expression out in code and keeps the result. */
function calcStep(s: Extract<ParsedStep, { kind: 'calc' }>, index: number, fields: InputField[]): Workflow<Ctx>['steps'][number] {
  const compiled = compileCalc(s.expression);
  return { kind: 'code', id: `calc${index}`, title: s.label, run: (ctx) => {
    if (!compiled.ok) throw new Error(compiled.error);
    const vars: Record<string, number> = { ...ctx.values };
    for (const name of compiled.names) {
      if (name in vars) continue;
      const k = fields.findIndex((f) => f.label.toLowerCase() === name);
      const raw = ctx.fields[`f${k}`] ?? '';
      const n = readNumber(raw);
      if (n === null) throw new Error(needsNumber(fields[k]?.label ?? name, raw));
      vars[name] = n;
    }
    const value = compiled.evaluate(vars);
    return { calcs: [...ctx.calcs, `${s.label}: ${showNumber(value)}`], values: { ...ctx.values, [s.label.toLowerCase()]: value } };
  } };
}

const needsNumber = (label: string, raw: string): string => {
  const typed = raw.trim();
  const detail = typed ? `(you typed "${typed}")` : '(it is empty)';
  return `"${label}" needs a number ${detail}.`;
};

/** The saved note: the calculations first (if any), then each AI result, headed by its step when there are several. */
function noteFor(title: string, ctx: Ctx): string {
  const lines = ctx.calcs.map((c) => `- ${c}`).join('\n');
  const sums = ctx.calcs.length ? `## Calculations\n${lines}\n\n` : '';
  const many = ctx.outputs.length > 1;
  const results = ctx.outputs.map((o, i) => (many ? `## Step ${i + 1}\n${o}` : o)).join('\n\n');
  return `# ${title}\n\n${sums}${results}\n`;
}

/** What a helper is for, in a line, for the notes made from a long text: its name and its instructions. */
const jobOf = (title: string, steps: ParsedStep[]): string => `${title}: ${steps.flatMap((x) => (x.kind === 'ai' ? [x.text] : [])).join(' ')}`.slice(0, 400);
