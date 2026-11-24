/**
 * Reads a list of things from a photo (what is in the fridge) with the model's eyes, for a job that starts from a list. The model only
 * names what it sees; the answer is cleaned into a plain list in code, and the person sees and edits it in the text box before anything
 * else happens, so a wrong guess is theirs to remove.
 */
import { runBackgroundJob } from '../services/llmJobQueue';
import { llmService } from '../services/llm';
import { ensureTextModel } from '../atlasTools/models';
import { localUniqueId } from '../utils/uniqueId';

const NO_VISION = 'The loaded model cannot see pictures. Pick a model that has a vision file (the eye icon in My models) and try again.';
const MAX_ITEMS = 30;

/** A model's list of items as a clean list: one thing per entry, no bullets or numbers, no repeats, no sentences. Pure. */
function parseItems(raw: string): string[] {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').replace(/```[a-z]*/gi, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const item = part.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\.$/, '').trim().toLowerCase();
    if (item.length < 2 || item.split(/\s+/).length > 4 || /^(none|nothing|no items?|i can(?:'|no)t)/.test(item) || seen.has(item)) continue;
    seen.add(item); out.push(item);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** The food and ingredients in a photo, as "a, b, c". Throws a plain sentence when the model cannot see pictures or sees none. */
export async function readFoodFromPhoto(uri: string, mimeType: string | undefined): Promise<string> {
  await ensureTextModel(null);
  if (!llmService.supportsVision()) throw new Error(NO_VISION);
  const attachment = { id: localUniqueId('img'), type: 'image' as const, uri: uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`, mimeType: mimeType ?? 'image/jpeg' };
  const messages = [{ id: 'user-pantry', role: 'user', content: 'List every food item or ingredient you can clearly see in this picture, one per line, with no other words. Do not guess at things you cannot see. If there is no food, reply only: NONE.', timestamp: 0, attachments: [attachment] }];
  const raw = await runBackgroundJob(() => llmService.generateResponse(messages as never, { disableThinking: true }), { label: 'Reading a photo of food', maxWaitMs: 10 * 60_000 });
  const items = parseItems(raw);
  if (!items.length) throw new Error('No food could be seen in that picture. Try a closer, brighter photo, or type the list.');
  return items.join(', ');
}
