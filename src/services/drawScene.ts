/**
 * Draws a picture from a piece of text: the text model turns it into a short description of what can be seen, then the image
 * model paints it. One place for every feature that illustrates (Roundtable scenes, the Photo studio). Drawing is a bonus: with
 * no image model chosen nothing is drawn, and a failure is the caller's to ignore.
 */
import { imageGenerationService } from './imageGenerationService';
import { useAppStore } from '../stores';

/** Whether an image model is chosen, so a feature can offer to draw. */
export const canDraw = (): boolean => !!useAppStore.getState().activeImageModelId;

const DEFAULT_STYLE = 'storybook illustration, soft light, painted';

type Ask = (system: string, user: string) => Promise<string>;

const cleanLine = (t: string): string => t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);

/** Writes the picture description (only things that can be seen) for a text, in at most 30 words. */
export async function pictureDescription(text: string, ask: Ask, known?: string): Promise<string> {
  return cleanLine(await ask(
    'You write one-sentence picture descriptions for an image generator. Only things that can be seen: the place, the light, objects, people and what they are doing. No names, no words or writing in the picture.',
    `Scene:\n${text}\n${known ? `\nWhat is known:\n${known}\n` : ''}\nWrite the picture description in at most 30 words.`,
  ));
}

/** Paints a description in a style. Returns the picture's file path, or null when nothing was drawn. */
export async function paint(description: string, style: string = DEFAULT_STYLE): Promise<string | null> {
  if (!canDraw() || !description) return null;
  const image = await imageGenerationService.generateImage({ prompt: `${description}, ${style}` });
  return image?.imagePath ?? null;
}

/** A text to a picture in one go: describe it, then paint it. */
export async function drawText(text: string, ask: Ask, opts: { known?: string; style?: string } = {}): Promise<string | null> {
  if (!canDraw()) return null;
  return paint(await pictureDescription(text, ask, opts.known), opts.style);
}
