/**
 * Multi-step helpers you write yourself. A helper is a title plus a few lines in plain text, one step per line:
 *   field: Tone | Friendly, Formal     a choice asked before it starts (leave out the choices for a typed answer)
 *   ask: Keep it short? | Yes, No      a choice asked part-way through (choices are needed)
 *   ai: Write a reply in that tone.    one AI step: it follows the instruction using the text and your answers
 * The last AI result is shown for approval, then saved as a note. The AI never sees anything beyond what you give it.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InputField, Workflow } from './engine';

export interface CustomHelper { id: string; title: string; summary: string; help: string; steps: string; createdAt: number }
interface State { helpers: CustomHelper[]; save: (h: Omit<CustomHelper, 'createdAt'>) => void; remove: (id: string) => void }

export const useCustomHelpers = create<State>()(persist((set) => ({
  helpers: [],
  save: (h) => set((s) => ({ helpers: [{ ...h, createdAt: s.helpers.find((x) => x.id === h.id)?.createdAt ?? Date.now() }, ...s.helpers.filter((x) => x.id !== h.id)].slice(0, 30) })),
  remove: (id) => set((s) => ({ helpers: s.helpers.filter((x) => x.id !== id) })),
}), { name: 'atlas-custom-helpers', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ helpers: s.helpers }) }));

export interface ParsedSteps { fields: InputField[]; steps: Array<{ kind: 'ask' | 'ai'; text: string; options?: string[] }>; errors: string[] }

const choices = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8);

/** Reads the step lines. Anything that is not a step is reported, so a typo is never silently dropped. Pure. */
export function parseSteps(source: string): ParsedSteps {
  const out: ParsedSteps = { fields: [], steps: [], errors: [] };
  source.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = /^(field|ask|ai)\s*:\s*(.+)$/i.exec(line);
    if (!m) { out.errors.push(`Line ${i + 1} must start with field:, ask: or ai:`); return; }
    const kind = m[1].toLowerCase();
    const [head, rest] = m[2].split('|').map((x) => x.trim());
    if (kind === 'field') out.fields.push({ id: `f${out.fields.length}`, label: head.slice(0, 60), placeholder: head.slice(0, 60), ...(rest ? { options: choices(rest) } : {}) });
    else if (kind === 'ask') {
      const options = choices(rest ?? '');
      if (options.length < 2) out.errors.push(`Line ${i + 1}: an ask: step needs two or more choices after a |`);
      else out.steps.push({ kind: 'ask', text: head.slice(0, 200), options });
    } else out.steps.push({ kind: 'ai', text: m[2].slice(0, 600) });
  });
  if (!out.steps.some((s) => s.kind === 'ai')) out.errors.push('Add at least one ai: step.');
  return out;
}

interface Ctx { text: string; fields: Record<string, string>; fieldLabels: string[]; answers: string[]; outputs: string[]; note?: string }

/** Turns a written helper into a workflow the engine can run. */
export function toWorkflow(h: CustomHelper): Workflow<Ctx> {
  const parsed = parseSteps(h.steps);
  const steps: Workflow<Ctx>['steps'] = parsed.steps.map((s, i) => (s.kind === 'ask'
    ? { kind: 'ask' as const, id: `ask${i}`, title: s.text, questions: () => [{ id: 'q', text: s.text, options: s.options }], apply: (ctx, a) => ({ answers: [...ctx.answers, `${s.text} ${a.q ?? ''}`] }) }
    : { kind: 'model' as const, id: `ai${i}`, title: s.text.slice(0, 50), run: async (ctx, ask) => {
      const known = [...ctx.fieldLabels.map((label, k) => `${label}: ${ctx.fields[`f${k}`] ?? ''}`), ...ctx.answers].filter(Boolean).join('\n');
      const reply = await ask('You follow one instruction using only the information given. Never invent facts, names, numbers or dates that are not in it. If something needed is missing, say what is missing.',
        `Instruction: ${s.text}\n\nText:\n${ctx.text}\n${known ? `\nChoices:\n${known}\n` : ''}${ctx.outputs.length ? `\nEarlier results:\n${ctx.outputs.join('\n\n')}\n` : ''}`.slice(0, 9000));
      const result = reply.trim().slice(0, 6000);
      if (!result) throw new Error('The AI gave no answer. Try again.');
      return { outputs: [...ctx.outputs, result] };
    } }));
  return {
    id: `custom-${h.id}`, title: h.title, summary: h.summary || 'A helper you made.',
    input: { help: h.help || 'Paste or type what this helper should work on.', minChars: 1, fields: parsed.fields,
      make: (t, f) => ({ text: t, fields: f, fieldLabels: parsed.fields.map((x) => x.label), answers: [], outputs: [] }) },
    steps: [...steps,
      { kind: 'confirm', id: 'review', title: 'Review', summary: (ctx) => ctx.outputs[ctx.outputs.length - 1] ?? '' },
      { kind: 'code', id: 'note', title: 'Make the note', run: (ctx) => ({ note: `# ${h.title}\n\n${ctx.outputs.map((o, i) => (ctx.outputs.length > 1 ? `## Step ${i + 1}\n${o}` : o)).join('\n\n')}\n` }) }],
  };
}
