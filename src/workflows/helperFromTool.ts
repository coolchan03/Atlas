/**
 * The chat model can make a multi-step helper (the make_helper tool). It is checked with the same reader as a helper the person writes, saved in
 * the helpers list marked as made by the AI, and does nothing until the person opens it and presses Start: a helper only ever sends the text
 * and answers the person gives it to the model, one instruction at a time.
 */
import { parseSteps, useCustomHelpers } from './customHelpers';

const MAX_STEP_LINES = 8;
const MAX_HELPERS_FROM_AI = 10;
const MAX_HELPERS = 30; // what the list keeps (customHelpers.ts)

export function saveHelperFromTool(input: { title: string; steps: string; summary?: string }): string {
  const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!title) throw new Error('Missing required parameter: title');
  const lines = input.steps.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_STEP_LINES) throw new Error(`A helper has at most ${MAX_STEP_LINES} step lines.`);
  const parsed = parseSteps(lines.join('\n'));
  if (parsed.errors.length) throw new Error(`The helper was not saved: ${parsed.errors.join(' ')}`);
  const store = useCustomHelpers.getState();
  // The same title again (a retry, or asked twice) replaces the AI's earlier copy instead of adding another; a helper the person wrote is never replaced.
  const again = store.helpers.find((h) => h.madeByAi && h.title.toLowerCase() === title.toLowerCase());
  if (!again && store.helpers.filter((h) => h.madeByAi).length >= MAX_HELPERS_FROM_AI) throw new Error('There are already 10 helpers made by the AI. Ask the user to delete some first.');
  // The list keeps 30: saving one more would silently push the oldest (maybe one the person wrote) off the end.
  if (!again && store.helpers.length >= MAX_HELPERS) throw new Error('The helper list is full (30). Ask the user to delete some first.');
  const id = again?.id ?? `ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  store.save({ id, title, summary: (input.summary ?? '').trim().slice(0, 140), help: 'Paste or type what this helper should work on.', steps: lines.join('\n'), madeByAi: true });
  return `Saved "${title}" in Multi-step helpers (Home, Multi-step helpers). The user can read its steps, edit them and run it from there.`;
}
