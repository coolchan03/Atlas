/**
 * "Refine with AI" for the task the AI learns: turns a rough idea ("tax stuff for small business") into a clear task that says what to
 * become expert at, what to cover, and how to know it knows it, so the research and the questions it writes start from something
 * precise. The person sees the suggestion and chooses to use it or keep their own words. Pure parts are tested without a device.
 */
export function refineMessages(task: string, context: { subject?: string; project?: string } = {}) {
  return {
    system: 'You help people write a clear learning task for an AI that will research a subject and teach itself. Reply with ONLY the improved task as plain text.',
    user: `Rewrite this learning task so it is clear and specific.${context.subject ? `\nThe subject area is: ${context.subject}.` : ''}${context.project ? `\nThe AI will research the documents in the project "${context.project}".` : ''}
Keep what the person meant and do not add topics they did not ask for. Say: what to become expert at, the parts to cover (a short list inside the sentence), who it is for or the level, and what a correct answer looks like. Two to four sentences, no headings, no lists, no quotation marks.

TASK: ${task.trim().slice(0, 600)}`,
  };
}

/** The suggestion with any quotes, labels or markdown stripped; null when there is nothing usable. */
export function parseRefined(raw: string): string | null {
  const stripQuotes = (s: string) => s.trim().replace(/^["'`“”]+|["'`“”]+$/g, '').trim();
  const body = stripQuotes(raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[^\n]*\n?/g, '').trim());
  const text = stripQuotes(body.replace(/^\s*(improved task|refined task|task)\s*:\s*/i, '')).replace(/\s*\n+\s*/g, ' ').trim();
  return text.length >= 15 ? text.slice(0, 700) : null;
}

export async function refineTask(task: string, ask: (system: string, user: string) => Promise<string>, context: { subject?: string; project?: string } = {}): Promise<string> {
  const { system, user } = refineMessages(task, context);
  const refined = parseRefined(await ask(system, user));
  if (!refined) throw new Error('The AI did not write a usable task. Try again, or use a bigger model.');
  return refined;
}
