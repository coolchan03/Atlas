/**
 * Change a board by telling the AI what is wrong with it ("add a chapter on leases", "remove the word games", "chapter 3 is missing a
 * quiz"). The AI answers with a small list of squares to add (and where) and squares to remove; squares already played are never removed.
 */
import { askModel } from '../study/engine';
import { FORMAT_IDS } from './formats';
import { useTopics, type Course } from './store';
import type { SquareFormat } from './plannedSquare';

export interface BoardChange { remove: string[]; add: Array<{ afterKey: string; format: SquareFormat; title: string; focus: string }> }

/** The prompt: the board as one line per square (key, kind, title, chapter) and the request. */
export function editPrompt(course: Course, request: string): { system: string; user: string } {
  const lines = course.squares.map((q) => `${q.key} | ${q.format} | ${q.title} | ${q.unit}${course.progress[q.key] ? ' | played' : ''}`).join('\n');
  return {
    system: 'You edit a learning board. Reply with ONLY JSON.',
    user: `The board, one square per line (key | kind | title | chapter):\n${lines.slice(0, 12000)}\n\nThe learner says: "${request.slice(0, 600)}"\n\nReply with ONLY JSON: {"remove":["keys of squares to remove"],"add":[{"after":"key of the square to add it after","format":"one of ${FORMAT_IDS.join('|')}","title":"short title","focus":"what it covers"}]}. Never remove a square marked played. Use [] when nothing is needed.`,
  };
}

/** A strict reader of the AI's answer: only real keys, only real kinds, played squares kept. Null when it is not usable. */
export function parseChange(raw: string, course: Course): BoardChange | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const keys = new Set(course.squares.map((q) => q.key));
    const remove = (Array.isArray(j.remove) ? j.remove : []).map(String).filter((k: string) => keys.has(k) && !course.progress[k]);
    const add = (Array.isArray(j.add) ? j.add : []).slice(0, 20).flatMap((a: any) => {
      const format = String(a?.format ?? '').toLowerCase() as SquareFormat;
      const afterKey = String(a?.after ?? '');
      return keys.has(afterKey) && FORMAT_IDS.includes(format) && String(a?.title ?? '').trim() ? [{ afterKey, format, title: String(a.title).slice(0, 60), focus: String(a.focus ?? a.title).slice(0, 300) }] : [];
    });
    return { remove, add };
  } catch { return null; }
}

/** Asks the AI and applies the change to the board. Returns what was done, or null when the answer could not be used. */
export async function editBoard(courseId: string, request: string): Promise<{ added: number; removed: number } | null> {
  const course = useTopics.getState().courses.find((c) => c.id === courseId);
  if (!course || !request.trim()) return null;
  const p = editPrompt(course, request);
  const change = parseChange(await askModel(p.system, p.user), course);
  if (!change) return null;
  let added = 0;
  for (const a of change.add) if (useTopics.getState().addSquare(courseId, a.afterKey, { format: a.format, title: a.title, focus: a.focus })) added += 1;
  if (change.remove.length) useTopics.getState().removeSquares(courseId, change.remove);
  return { added, removed: change.remove.length };
}
