/**
 * One agent asking another. The Assistant can put a question to the specialist who knows the subject (Home Chef, Accountant,
 * Repair Helper...) and pass the answer on. Code picks the specialist, not the model, and the person is asked first, every time.
 *
 * What crosses over is one way and small: the specialist sees only the question, never the chat so far and never another
 * agent's memories. It answers in a single turn with its own prompt and lessons, with no tools, so a consulted agent cannot ask
 * a third agent (one hop at most, no loops).
 */
import { agentPromptWithLessons, useAgentStore, type Agent } from '../stores/agentStore';
import { askModel } from '../study/engine';
import { confirm } from '../atlasTools/deviceTools';

/** Characters that are never consulted whatever their setting: they are people to talk to, not sources of answers. */
const NEVER = new Set(['counselor']);

/** Extra words that point at a built-in specialist, beyond its own name and description (a chef is asked about roasting, not only "dinner"). */
const HINTS: Record<string, RegExp> = {
  atlas: /\b(first aid|bleed\w*|wound|burn|burns|fracture|broken bone|choking|cpr|snake ?bite|hypothermia|heat ?stroke|dehydrat\w*|survival|purify|shelter|campfire|navigate|lost in|wilderness|emergency)\b/i,
  'home-chef': /\b(recipe|cook|cooking|bake|baking|roast|fry|boil|simmer|grill|dinner|lunch|breakfast|meal|ingredient|ingredients|oven|stove|marinade|sauce|dough|vegan|vegetarian|gluten|substitut\w*|chef)\b/i,
  accountant: /\b(tax|taxes|deduct\w*|invoice|receipt|bookkeep\w*|ledger|budget|expense|expenses|bank statement|balance sheet|payroll|depreciation|accounting|accountant|audit)\b/i,
  'repair-helper': /\b(repair|fix|broken|leak\w*|faucet|outlet|wiring|appliance|washer|dryer|furnace|drill|hinge|drywall|clog\w*|won'?t (start|turn on)|stopped working)\b/i,
  'paperwork-reader': /\b(form|forms|paperwork|contract|lease|letter|notice|policy|terms|clause|fine print|bill explained|explain this document)\b/i,
};

const words = (t: string): string[] => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/** Agents that ship with Atlas. A built-in one is matched by its topic hints only; its description is too general to match words against. */
const BUILT_IN = new Set(['atlas', 'field-id', 'phone-assistant', 'writer', 'counselor', 'accountant', 'repair-helper', 'home-chef', 'paperwork-reader', 'friend', 'jock-boyfriend', 'girlfriend', 'mentor']);

/** The agents that may be asked, leaving out the one that is asking. */
export function consultable(agents: Agent[], askerId?: string | null): Agent[] {
  return agents.filter((a) => a.id !== askerId && !NEVER.has(a.id) && a.kind !== 'pal' && a.consultable !== false && !(BUILT_IN.has(a.id) && !HINTS[a.id]) && a.systemPrompt.trim().length > 0);
}

/** How well an agent fits a question. Built-in agents: their topic hints. Agents the person made: words shared with the name, description and skills (two or more). */
function fit(question: string, a: Agent): number {
  const hint = HINTS[a.id];
  if (hint) return (question.match(new RegExp(hint.source, 'gi')) ?? []).length * 3;
  if (BUILT_IN.has(a.id)) return 0;
  const mine = new Set(words(`${a.name} ${a.description} ${(a.skills ?? []).join(' ')}`));
  const shared = words(question).filter((w) => mine.has(w)).length;
  return shared >= 2 ? shared : 0;
}

/** The best specialist for a question, or none when nobody fits clearly. A name the model gave is trusted when it matches an agent. */
export function pickSpecialist(question: string, named: string | undefined, agents: Agent[]): Agent | undefined {
  const want = (named ?? '').trim().toLowerCase();
  const byName = want ? agents.find((a) => a.name.toLowerCase() === want || a.id === want || a.name.toLowerCase().includes(want)) : undefined;
  if (byName) return byName;
  const ranked = agents.map((a) => ({ a, score: fit(question, a) })).filter((x) => x.score > 0).sort((x, y) => y.score - x.score);
  return ranked[0]?.a;
}

/** Whether a message is about something one of the specialists handles: only then is the consult tool worth offering. */
export function specialistRelevant(message: string): boolean {
  const { agents, activeAgentId } = useAgentStore.getState();
  return consultable(agents, activeAgentId).some((a) => fit(message, a) > 0);
}

/** The roster the model sees in the tool's description: who can be asked and what they are for. */
export function specialistRoster(): string {
  const { agents, activeAgentId } = useAgentStore.getState();
  return consultable(agents, activeAgentId).map((a) => `${a.name} (${a.description})`).join('; ');
}

const NO_FIT = 'No other agent fits this question, so answer it yourself.';

/** The tool: choose the specialist, ask the person, ask the specialist, hand the answer back with where it came from. */
export async function consultSpecialist(args: { question?: unknown; agent?: unknown }, signal?: AbortSignal): Promise<string> {
  const question = String(args.question ?? '').trim();
  if (!question) throw new Error('Missing required parameter: question');
  const { agents, activeAgentId } = useAgentStore.getState();
  const specialist = pickSpecialist(question, typeof args.agent === 'string' ? args.agent : undefined, consultable(agents, activeAgentId));
  if (!specialist) return NO_FIT;
  const ok = await confirm(`Ask ${specialist.name}?`, `The assistant wants to ask ${specialist.name}:\n\n"${question.slice(0, 400)}"\n\n${specialist.name} sees only this question, not the rest of your chat.`, 'Ask');
  if (!ok) return `The user did not want to ask ${specialist.name}. Answer it yourself and do not offer again.`;
  if (signal?.aborted) throw new Error('The question was cancelled before it was asked.');
  const reply = (await askModel(agentPromptWithLessons(specialist), question)).trim();
  if (!reply) return `${specialist.name} did not answer. Answer it yourself.`;
  return `Asked ${specialist.name}. Their answer:\n${reply}\n\nGive this to the user as ${specialist.name}'s answer. Keep numbers, amounts and safety steps exactly as written.`;
}
