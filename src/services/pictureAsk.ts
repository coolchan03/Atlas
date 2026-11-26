/**
 * Asks the loaded model about a picture. One place for every feature that reads a photo (the Translator's camera, the Photo
 * studio): it waits its turn behind a chat reply, needs a model with a vision file, and builds the picture attachment the same way.
 */
import { runBackgroundJob } from './llmJobQueue';
import { llmService } from './llm';
import { ensureTextModel } from '../atlasTools/models';
import { localUniqueId } from '../utils/uniqueId';

const NO_VISION_MESSAGE = 'The loaded model cannot see pictures. Pick a model that has a vision file (the eye icon in My models) and try again.';

type Msg = { id: string; role: 'system' | 'user'; content: string; timestamp: number; attachments?: unknown[] };

/** A plain user message that carries the picture (what a model needs to look at it). */
const pictureMessage = (attachment: unknown, content: string): Msg => ({ id: 'user-picture', role: 'user', content, timestamp: 0, attachments: [attachment] });

export interface Picture { uri: string; mimeType?: string }

/** Runs a request about a picture. `build` makes the messages once the picture is attached. */
export async function runVision(build: (attachment: unknown) => unknown[], picture: Picture, label: string): Promise<string> {
  const { uri, mimeType } = picture;
  await ensureTextModel(null);
  if (!llmService.supportsVision()) throw new Error(NO_VISION_MESSAGE);
  const attachment = { id: localUniqueId('img'), type: 'image' as const, uri: uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`, mimeType: mimeType ?? 'image/jpeg' };
  return runBackgroundJob(() => llmService.generateResponse(build(attachment) as never, { disableThinking: true }), { label, maxWaitMs: 10 * 60_000 });
}

/** One question about one picture. */
export const askAboutPicture = (picture: Picture, prompt: string, label: string): Promise<string> =>
  runVision((attachment) => [pictureMessage(attachment, prompt)], picture, label);
