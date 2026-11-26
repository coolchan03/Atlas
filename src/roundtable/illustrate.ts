/**
 * Draws a scene for a roundtable turn: the text model turns the turn into a short picture description (only things that can
 * be seen), then the image model draws it. The picture is a bonus: with no image model, or a failure, nothing is drawn.
 */
import { imageGenerationService } from '../services/imageGenerationService';
import { useAppStore } from '../stores';
import { cleanReply, type Ask, type Session, type Turn } from './engine';

/** Whether an image model is chosen, so "draw each scene" can be offered. */
export const canDraw = (): boolean => !!useAppStore.getState().activeImageModelId;

const STYLE = 'storybook illustration, soft light, painted';

export async function illustrateScene(turn: Turn, session: Session, ask: Ask): Promise<string | null> {
  if (!canDraw()) return null;
  const description = cleanReply(await ask(
    'You write one-sentence picture descriptions for an image generator. Only things that can be seen: the place, the light, objects, people and what they are doing. No names, no words or writing in the picture.',
    `Scene:\n${turn.text}\n${session.state ? `\nWhat is known:\n${session.state}\n` : ''}\nWrite the picture description in at most 30 words.`,
  ), 'Picture');
  if (!description) return null;
  const image = await imageGenerationService.generateImage({ prompt: `${description}, ${STYLE}` });
  return image?.imagePath ?? null;
}
