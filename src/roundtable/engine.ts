/**
 * Runs a Roundtable: one model, many roles, one turn at a time. `runRoleTurn` is the single entry point every format and the
 * agent-to-agent consult share for "one role speaks": it builds the prompt (persona, rules, topic, notes, state, a rolling
 * summary, the last few turns) and cleans the reply. The runner walks a format's steps, pauses for the person, stops on
 * request and jumps to the closing when a role says the work is done. Nothing here touches the screen.
 */
import { formatById, type Role, type RoundtableFormat, type Step } from './formats';

export interface Turn { role: string; name: string; text: string; hidden?: boolean; /** A picture drawn for this turn (file path). */ image?: string }

export type SessionStatus = 'running' | 'waiting' | 'stopped' | 'done' | 'error';

export interface Session {
  id: string;
  formatId: string;
  topic: string;
  notes: string;
  roles: Role[];
  steps: Step[];
  cursor: number;
  turns: Turn[];
  /** What happened before the last few turns, so a long session still fits a small model. */
  summary: string;
  summarized: number;
  /** The shared state a hidden role keeps (a game's place and inventory). */
  state: string;
  status: SessionStatus;
  error?: string;
  /** Draw a picture for the turns of roles that can be drawn. */
  pictures?: boolean;
  createdAt: number;
}

export type Ask = (system: string, user: string) => Promise<string>;
export interface Deps {
  ask: Ask; shouldStop?: () => boolean; onUpdate?: (s: Session) => void;
  /** Draws a turn and returns the picture's file path, or null. Failing to draw never stops the session. */
  illustrate?: (turn: Turn, session: Session) => Promise<string | null>;
}

/** Turns kept word for word in each prompt; older ones live in the summary. */
const RECENT = 4;
/** When this many turns are older than the recent ones, they are folded into the summary. */
const COMPACT_AT = 4;
const MAX_REPLY = 1400;

export function newSession(format: RoundtableFormat, opts: { topic: string; rounds?: number; notes?: string; id?: string; pictures?: boolean }): Session {
  const rounds = Math.max(1, Math.min(format.maxRounds, Math.round(opts.rounds ?? format.defaultRounds)));
  return {
    id: opts.id ?? `rt-${Date.now().toString(36)}`, formatId: format.id, topic: opts.topic.trim(), notes: (opts.notes ?? '').trim(),
    roles: format.roles(opts.topic), steps: format.plan(rounds), cursor: 0, turns: [], summary: '', summarized: 0, state: '', status: 'running', createdAt: Date.now(), ...(opts.pictures ? { pictures: true } : {}),
  };
}

const line = (t: Turn) => `${t.name}: ${t.text}`;

/** The model's reply as a clean spoken turn: no reasoning, no "Name:" prefix, no leftover markup, a sane length. */
export function cleanReply(raw: string, name: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\*\*|__/g, '').trim();
  t = t.replace(new RegExp(`^\\s*(?:\\[?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?)\\s*[:\\-]\\s*`, 'i'), '');
  // A model sometimes goes on to write the next speaker's line: keep only this role's turn.
  const next = t.search(/\n\s*[A-Z][A-Za-z ]{1,20}:\s/);
  if (next > 0) t = t.slice(0, next);
  return t.trim().slice(0, MAX_REPLY);
}

export interface TurnInput {
  role: Role;
  step: Step;
  format: RoundtableFormat;
  topic: string;
  notes?: string;
  state?: string;
  summary?: string;
  recent?: Turn[];
}

/** The prompts for one role's turn. Exported so the other places where one agent speaks for another use the same shape. */
export function turnPrompt(i: TurnInput): { system: string; user: string } {
  const sentences = i.step.sentences ?? 4;
  const system = `${i.role.persona}\n${i.format.rules}\nYou are ${i.role.name}. Speak only as ${i.role.name}, in at most ${sentences} sentences.`;
  const parts = [
    `Topic: ${i.topic}`,
    i.notes ? `Notes (facts may come from these):\n${i.notes.slice(0, 3000)}` : '',
    i.state ? `STATE:\n${i.state}` : '',
    i.summary ? `Earlier in this session: ${i.summary}` : '',
    i.recent?.length ? `Last turns:\n${i.recent.map(line).join('\n')}` : '',
    `Your turn, ${i.role.name}. ${i.step.instruction}`,
  ].filter(Boolean);
  return { system, user: parts.join('\n\n') };
}

/** One role speaks once. The single place a role's turn is built, asked and cleaned. */
export async function runRoleTurn(input: TurnInput, ask: Ask): Promise<string> {
  const { system, user } = turnPrompt(input);
  return cleanReply(await ask(system, user), input.role.name);
}

/** Folds the turns older than the recent ones into the summary (one short model call). */
async function compact(s: Session, ask: Ask): Promise<Session> {
  const visible = s.turns.filter((t) => !t.hidden);
  const old = visible.slice(0, Math.max(0, visible.length - RECENT));
  const fresh = old.slice(s.summarized);
  if (fresh.length < COMPACT_AT) return s;
  const text = await ask(
    'You shorten transcripts. Keep names, positions, decisions and open questions. Do not add anything.',
    `${s.summary ? `So far: ${s.summary}\n\n` : ''}New turns:\n${fresh.map(line).join('\n')}\n\nWrite the updated summary in at most four sentences.`,
  );
  return { ...s, summary: cleanReply(text, 'Summary').slice(0, 700), summarized: old.length };
}

const closingIndex = (steps: Step[], from: number): number => {
  const i = steps.findIndex((st, k) => k >= from && st.closing);
  return i < 0 ? steps.length : i;
};

/**
 * Runs the steps from the cursor until the session needs the person, is stopped, fails or ends. A failed turn leaves the
 * cursor where it was, so running again retries that turn.
 */
export async function advance(session: Session, deps: Deps): Promise<Session> {
  const format = formatById(session.formatId);
  if (!format) return { ...session, status: 'error', error: 'This kind of roundtable is no longer available.' };
  let s: Session = { ...session, status: 'running', error: undefined };
  while (s.cursor < s.steps.length) {
    if (deps.shouldStop?.()) return { ...s, status: 'stopped' };
    const step = s.steps[s.cursor];
    if (step.kind === 'player') return { ...s, status: 'waiting' };
    const role = s.roles.find((r) => r.id === step.role);
    if (!role) { s = { ...s, cursor: s.cursor + 1 }; continue; }
    try {
      s = await compact(s, deps.ask);
      const visible = s.turns.filter((t) => !t.hidden);
      const reply = await runRoleTurn({ role, step, format, topic: s.topic, notes: s.notes, state: s.state, summary: s.summary, recent: visible.slice(-RECENT) }, deps.ask);
      if (!reply) throw new Error(`${role.name} did not answer.`);
      if (deps.shouldStop?.() && step.kind === 'say') return { ...s, status: 'stopped' }; // stopped while it was writing: drop the half turn
      s = {
        ...s, cursor: s.cursor + 1,
        turns: [...s.turns, { role: role.id, name: role.name, text: reply, hidden: step.kind === 'hidden' }],
        state: step.kind === 'hidden' ? reply.slice(0, 700) : s.state,
      };
      if (step.endsIf && new RegExp(step.endsIf).test(reply)) s = { ...s, cursor: closingIndex(s.steps, s.cursor) };
      if (s.pictures && role.draws && step.kind === 'say' && deps.illustrate) s = await drawLast(s, deps);
      deps.onUpdate?.(s);
    } catch (e) {
      return { ...s, status: 'error', error: String((e as Error)?.message || e).slice(0, 200) };
    }
  }
  return { ...s, status: 'done' };
}

/** Draws the turn just written. A picture that fails is simply left out; the story goes on. */
async function drawLast(s: Session, deps: Deps): Promise<Session> {
  const last = s.turns[s.turns.length - 1];
  try {
    const image = await deps.illustrate!(last, s);
    if (!image) return s;
    const turns = s.turns.slice(0, -1).concat({ ...last, image });
    const drawn = { ...s, turns };
    deps.onUpdate?.(drawn);
    return drawn;
  } catch { return s; }
}

/** The person's turn at a waiting step. */
export function playerSays(session: Session, text: string): Session {
  const step = session.steps[session.cursor];
  const role = session.roles.find((r) => r.id === step?.role);
  const said = text.trim();
  if (!step || step.kind !== 'player' || !role || !said) return session;
  return { ...session, cursor: session.cursor + 1, status: 'running', turns: [...session.turns, { role: role.id, name: role.name, text: said.slice(0, 1200) }] };
}

/** Skips the rest of the discussion and goes to the closing step. */
export function wrapUp(session: Session): Session {
  const at = closingIndex(session.steps, session.cursor);
  return at >= session.steps.length ? { ...session, cursor: session.steps.length, status: 'done' } : { ...session, cursor: at, status: 'running' };
}

/** How far through the session is: the steps done out of all of them. */
export const progress = (s: Session): { done: number; total: number } => ({ done: Math.min(s.cursor, s.steps.length), total: s.steps.length });

/** The speaker letter used to pick a voice (A, B or C) for a role: each role keeps the same voice throughout. */
export const hostOf = (s: Session, roleId: string): 'A' | 'B' | 'C' => (['A', 'B', 'C'] as const)[Math.max(0, s.roles.filter((r) => !r.human).findIndex((r) => r.id === roleId)) % 3];

/** The visible transcript as plain text to share or save. */
export function transcriptText(s: Session): string {
  const f = formatById(s.formatId);
  return [`${f?.label ?? 'Roundtable'}: ${s.topic}`, '', ...s.turns.filter((t) => !t.hidden).map(line)].join('\n');
}
