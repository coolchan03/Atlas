/**
 * Which installed skill applies to a message, and the note that puts its instructions in the prompt. A skill applies when the
 * person calls it by name ("/summarize-notes ...") or when the message shares enough words with its name and description.
 * Only the best match is used and it is cut to fit the model's context (a small model has little room), so a skill never
 * crowds out the chat. Pure, so it is tested without a device.
 */
import type { Skill } from './skillsStore';
import { skillSteps } from './skillSteps';

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'use', 'when', 'from', 'are', 'can', 'will', 'has', 'have', 'not', 'any', 'all', 'how', 'what', 'please', 'about', 'into', 'its', 'they', 'them', 'then', 'also', 'such', 'like', 'make', 'just']);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

/** The skill named at the start of the message ("/name rest"), if it can be called that way. */
export function calledSkill(message: string, skills: Skill[]): Skill | undefined {
  const m = /^\s*\/([a-z0-9-]+)\b/i.exec(message);
  return m ? skills.find((s) => s.enabled && s.userInvocable && s.name === m[1].toLowerCase()) : undefined;
}

/** Words shared between the message and a skill, name words counting triple. */
export function relevance(message: string, skill: Skill): number {
  const have = new Set(words(message).map(stem));
  const name = new Set(words(skill.name.replace(/-/g, ' ')).map(stem));
  const description = new Set(words(skill.description).map(stem));
  let score = 0;
  for (const w of have) score += (name.has(w) ? 3 : 0) + (description.has(w) ? 1 : 0);
  return score;
}

/** Skill text that fits: the model's context decides how much room there is. */
export const skillBudgetChars = (contextTokens: number) => (contextTokens <= 4096 ? 1500 : contextTokens <= 8192 ? 3500 : 6000);

/** Needs a clear match: a name word, or three description words. */
const MIN_SCORE = 3;

/** Extra weight for the skills an agent specialises in, so its own job wins over a loosely matching general skill. */
const SPECIALIST_BOOST = 4;

export function pickSkill(message: string, skills: Skill[], specialist: string[] = []): Skill | undefined {
  const on = skills.filter((s) => s.enabled);
  const named = calledSkill(message, on);
  if (named) return named;
  // The boost only helps a skill the message already has something to do with; it never makes an unrelated skill apply.
  const ranked = on.map((s) => { const rel = relevance(message, s); return { s, score: rel > 0 && specialist.includes(s.name) ? rel + SPECIALIST_BOOST : rel }; }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= MIN_SCORE) return best.s;
  // An agent with exactly one specialty always works that way, even when the message is short ("here it is").
  return specialist.length === 1 ? on.find((s) => s.name === specialist[0]) : undefined;
}

/** A reference file cut into pieces: one or more for each section (a heading and what follows it), none longer than `size` characters. Pure. */
export function referencePieces(text: string, size = 600): string[] {
  const pieces: string[] = [];
  for (const section of text.split(/\n(?=#{1,4} )/)) {
    let current = '';
    for (const block of section.split(/\n\s*\n/)) {
      const part = block.trim();
      if (!part) continue;
      if (current && current.length + part.length + 2 > size) { pieces.push(current); current = ''; }
      if (part.length > size) { for (let i = 0; i < part.length; i += size) pieces.push(part.slice(i, i + size)); } else current = current ? `${current}\n\n${part}` : part;
    }
    if (current) pieces.push(current);
  }
  return pieces;
}

/** The pieces of a skill's reference files that share the most words with the request, best first, up to `room` characters; none when nothing matches. Pure. */
export function relevantReferences(message: string, resources: Array<{ name: string; text: string }>, room: number): string[] {
  const have = new Set(words(message).map(stem));
  const scored = resources.flatMap((r) => referencePieces(r.text).map((text) => ({ name: r.name, text, score: [...new Set(words(text).map(stem))].filter((w) => have.has(w)).length })));
  const out: string[] = [];
  let used = 0;
  for (const piece of scored.filter((p) => p.score >= 2).sort((a, b) => b.score - a.score)) {
    const line = `[${piece.name}]\n${piece.text}`;
    if (used + line.length > room) continue;
    out.push(line); used += line.length;
  }
  return out;
}

/** The note added under the chat's instructions, or '' when no skill applies. */
/** `limits` is the model's context size, or that and the skills the chosen agent specialises in. */
export function skillsNote(message: string, skills: Skill[], limits: number | { contextTokens: number; specialist?: string[] }): string {
  const { contextTokens, specialist = [] } = typeof limits === 'number' ? { contextTokens: limits } : limits;
  const skill = pickSkill(message, skills, specialist);
  if (!skill) return '';
  const room = skillBudgetChars(contextTokens);
  const files = skill.resources ?? [];
  // A skill with reference files keeps most of its room for its instructions and gives the rest to the parts of the files the request is about.
  const bodyRoom = files.length ? Math.round(room * 0.65) : room;
  const body = skill.body.length > bodyRoom ? `${skill.body.slice(0, bodyRoom).trimEnd()}\n[... the rest of this skill was left out to fit the model's memory]` : skill.body;
  const refs = files.length ? relevantReferences(message, files, room - body.length) : [];
  const references = refs.length ? `\n\nFROM THE SKILL'S REFERENCE FILES (${files.map((f) => f.name).join(', ')}; only the parts that match the request):\n${refs.join('\n\n')}` : '';
  // A long skill written as steps is better done one step at a time than squeezed into the prompt: the model is pointed to the tool that does that.
  const hint = skill.body.length > bodyRoom && skillSteps(skill.body).length >= 2 ? `\n[This skill is long. To do the whole job, call work_in_steps with skill "${skill.name}" and the job in the user's words.]` : '';
  return `\n\nSKILL "${skill.name}" (instructions the user installed; follow them for this request):\n${body}${references}${hint}`;
}
