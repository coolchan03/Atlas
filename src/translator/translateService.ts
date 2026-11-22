/**
 * Runs the translator's requests on the loaded AI model. Every request goes through the background job queue, so it waits its turn behind
 * a chat reply instead of failing with "busy". The prompts and the parsing are in translate.ts.
 */
import { runBackgroundJob } from '../services/llmJobQueue';
import { llmService } from '../services/llm';
import { ensureTextModel } from '../atlasTools/models';
import { localUniqueId } from '../utils/uniqueId';
import type { TranslatorLanguage } from './languages';
import { bothWaysMessages, cleanTranslation, parseDirected, parsePicture, pictureMessages, textMessages } from './translate';

const NO_VISION_MESSAGE = 'The loaded model cannot see pictures. Pick a model that has a vision file (the eye icon in My models) and try again.';

async function ask(messages: unknown[], label: string): Promise<string> {
  await ensureTextModel(null);
  return runBackgroundJob(() => llmService.generateResponse(messages as never, { disableThinking: true }), { label, maxWaitMs: 5 * 60_000 });
}

/** Text mode. `from` null lets the AI recognise the language. */
export async function translateText(text: string, from: TranslatorLanguage | null, to: TranslatorLanguage): Promise<string> {
  return cleanTranslation(await ask(textMessages(text, from, to), 'Translating'));
}

/** Conversation mode: the text is in A or B and is translated into the other; says which side it went to (null when the AI did not say). */
export async function translateBothWays(text: string, a: TranslatorLanguage, b: TranslatorLanguage): Promise<{ to: 'A' | 'B' | null; text: string }> {
  return parseDirected(await ask(bothWaysMessages(text, a, b), 'Interpreting'));
}

/** Camera mode: the text in a picture, and its translation. Needs a model that can see pictures. */
export async function translatePicture(uri: string, mimeType: string | undefined, to: TranslatorLanguage): Promise<ReturnType<typeof parsePicture>> {
  await ensureTextModel(null);
  if (!llmService.supportsVision()) throw new Error(NO_VISION_MESSAGE);
  const attachment = { id: localUniqueId('img'), type: 'image' as const, uri: uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`, mimeType: mimeType ?? 'image/jpeg' };
  const raw = await runBackgroundJob(() => llmService.generateResponse(pictureMessages(attachment, to) as never, { disableThinking: true }), { label: 'Translating a picture', maxWaitMs: 10 * 60_000 });
  return parsePicture(raw);
}
