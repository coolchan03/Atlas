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

export async function runStepsInChat(conversationId: string, text: string): Promise<boolean> {
  const chat = useChatStore.getState();
  const conversation = chat.conversations.find((c) => c.id === conversationId);
  const enabledTools = enabledToolsFor(conversation as { enabledTools?: string[] } | undefined);
  const outcome = await trackTask({ type: 'other', title: 'Working through steps' }, async (ctl) => {
    return workThroughSteps(text, {
      ask: (system, user) => askModel(system, user),
      enabledTools,
      shouldStop: () => ctl.cancelled(),
      onProgress: (done, total, title) => ctl.progress({ stage: title, completed: done, total }),
      tool: async (name, args) => {
        const result = await executeToolCall({ id: `step-${Date.now()}`, name, arguments: args });
        if (result.error) throw new Error(result.error);
        return result.content;
      },
    });
  });
  if (!outcome) return false; // no plan, or stopped from Task Center before one was made
  const done = outcome;
  chat.addMessage(conversationId, { role: 'user', content: text });
  const summary = stepSummary(done.results);
  chat.addMessage(conversationId, { role: 'assistant', content: `${done.answer}${summary ? `\n\n---\nSteps:\n${summary}` : ''}` });
  return true;
}
