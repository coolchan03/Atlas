/** The AI's part of teach-back: a kind note and one question about the first missed point. The covered/missed list is from code and is not changed here. */
import { askShaped } from '../study/engine';
import type { PointCheck } from './coverage';

const SYSTEM = `You are a kind tutor. A student explained a topic and missed some points of the source. In two or three plain sentences, say what they did well, then ask one question that leads them to the first missed point without giving the answer away. Do not mention points that were covered as missing.`;

/** The tutor's note, or fixed words when there is nothing missed or the AI's note is empty. */
export async function tutorNote(checks: PointCheck[], ask: typeof askShaped = askShaped): Promise<string> {
  const missed = checks.filter((c) => !c.covered);
  if (!missed.length) return 'You covered every key point. Try explaining it to someone else, or without looking at the source.';
  const got = checks.filter((c) => c.covered).map((c) => `- ${c.point}`).join('\n') || '(none)';
  const out = (await ask(SYSTEM, `Points the student covered:\n${got}\n\nPoints missed:\n${missed.map((c) => `- ${c.point}`).join('\n')}\n\nTutor:`, { label: 'Writing tutor feedback', maxTokens: 160 })).trim();
  return out.length >= 20 ? out : `Look again at this point and try once more: ${missed[0].point}`;
}
