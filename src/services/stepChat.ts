/**
 * Connects "Work through steps" (stepRunner.ts) to a chat: saves the person's message, runs the plan with the chat's own enabled tools,
 * shows progress in Task Center (where it can be stopped), and saves the final answer as the assistant's reply. Returns false when no
 * usable plan was made, so the caller sends the message the ordinary way and nothing is lost.
 */
import { useAppStore, useChatStore } from '../stores';
import { askModel } from '../study/engine';
import { trackTask } from '../tasks/taskRegistry';
import { executeToolCall } from './tools';
import { workThroughSteps } from './stepRunner';
import type { StepResult } from './stepRunner';

/** The tools this chat may use: the chat's own list when it has one, else the app's, and only tools that exist. */
export function enabledToolsFor(conversation: { enabledTools?: string[] } | undefined): string[] {
  const { AVAILABLE_TOOLS } = require('./tools/registry') as { AVAILABLE_TOOLS: Array<{ id: string }> };
  const known = new Set(AVAILABLE_TOOLS.map((t) => t.id));
  return (conversation?.enabledTools ?? useAppStore.getState().settings.enabledTools ?? []).filter((t) => known.has(t));
}

/** A short record of what each step did, kept under the answer so the person can check it. */
export function stepSummary(results: StepResult[]): string {
  if (!results.length) return '';
  return results.map((r) => `${r.ok ? '✓' : '✗'} ${r.n}. ${r.title}${r.ok ? '' : ` (failed: ${r.error})`}`).join('\n');
}

/**
 * Runs "Work through steps" for one message. Returns false only when nothing was done (no usable plan, or the plan could not be asked
 * for), so the message can be sent the ordinary way. Once a plan exists the message is saved, and whatever happens after (finished,
 * stopped or failed) is saved as the reply and the function returns true: it never falls back to a normal send, which could repeat a tool.
 */
export async function runStepsInChat(conversationId: string, text: string): Promise<boolean> {
  const chat = useChatStore.getState();
  const conversation = chat.conversations.find((c) => c.id === conversationId);
  const enabledTools = enabledToolsFor(conversation as { enabledTools?: string[] } | undefined);
  const projectId = (conversation as { projectId?: string } | undefined)?.projectId;
  const abort = new AbortController();
  let saved = false;
  let stoppedByPerson = false;
  const saveUser = () => { if (!saved) { saved = true; chat.addMessage(conversationId, { role: 'user', content: text }); } };
  try {
    const outcome = await trackTask({ type: 'other', title: 'Working through steps' }, async (ctl) => {
      const poll = setInterval(() => { if (ctl.cancelled()) abort.abort(); }, 500);
      try {
        return await workThroughSteps(text, {
          ask: (system, user) => askModel(system, user),
          enabledTools,
          shouldStop: () => { const stop = ctl.cancelled(); if (stop) abort.abort(); return stop; },
          onPlan: saveUser,
          onProgress: (done, total, title) => ctl.progress({ stage: title, completed: done, total }),
          tool: async (name, args) => {
            const result = await executeToolCall({ id: `step-${Date.now()}`, name, arguments: args, context: { projectId }, signal: abort.signal });
            if (result.error) throw new Error(result.error);
            return result.content;
          },
        });
      } finally { clearInterval(poll); stoppedByPerson = ctl.cancelled(); }
    });
    if (outcome) {
      saveUser();
      const summary = stepSummary(outcome.results);
      chat.addMessage(conversationId, { role: 'assistant', content: `${outcome.answer}${summary ? `\n\n---\nSteps:\n${summary}` : ''}` });
      return true;
    }
    if (saved || stoppedByPerson) { saveUser(); chat.addMessage(conversationId, { role: 'assistant', content: 'Stopped. Nothing from the unfinished steps was used.' }); return true; }
    return false; // no usable plan: send the message the ordinary way
  } catch (e: any) {
    if (!saved) throw e; // nothing ran yet: the caller sends the message normally
    chat.addMessage(conversationId, { role: 'assistant', content: `The steps could not be finished: ${String(e?.message || e)}` });
    return true;
  }
}
