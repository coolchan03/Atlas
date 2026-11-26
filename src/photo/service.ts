/**
 * Runs a Photo studio mode on a picture: the model looks at it, a second call writes the passage where a mode needs one, and the
 * image model paints when the mode makes a picture and one is chosen. Every call goes through the shared vision and drawing code.
 */
import { askAboutPicture, type Picture } from '../services/pictureAsk';
import { askModel } from '../study/engine';
import { canDraw, paint, pictureDescription } from '../services/drawScene';
import { choiceOf, type PhotoMode } from './modes';

export interface PhotoResult {
  /** The narration or passage (empty for the sketch mode, which only paints). */
  text: string;
  /** What the model saw. */
  seen: string;
  /** The painted picture's file path, when one was drawn. */
  image: string | null;
  /** Why no picture was drawn, when a mode wanted one. */
  note?: string;
}

type Ask = (system: string, user: string) => Promise<string>;
export interface PhotoDeps { look?: (picture: Picture, prompt: string, label: string) => Promise<string>; ask?: Ask; draw?: (description: string, style?: string) => Promise<string | null> }

const clean = (t: string): string => t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\*\*|__/g, '').trim();

const SEE = 'Describe what this picture shows in three plain sentences: the place, the main things and people, the light, and any words that can be read. Say only what is really there.';
const SEE_SKETCH = 'This is a drawing or sketch. Describe what it shows in three plain sentences: the main subject, the shapes and layout, and any colours. Say only what is really there.';

export async function runPhoto(job: { mode: PhotoMode; choiceId?: string; picture: Picture }, deps: PhotoDeps = {}): Promise<PhotoResult> {
  const { mode, choiceId, picture } = job;
  const look = deps.look ?? ((pic: Picture, prompt: string, label: string) => askAboutPicture(pic, prompt, label));
  const ask = deps.ask ?? askModel;
  const draw = deps.draw ?? paint;
  const choice = choiceOf(mode, choiceId);

  if (mode.id === 'narrate') {
    const text = clean(await look(picture, `Look at this picture and narrate it as ${choice.text}. Use four to six sentences. Describe only what is really visible and never guess names of people or places.`, 'Narrating a picture'));
    if (!text) throw new Error('The model could not describe the picture. Try a clearer one.');
    return { text, seen: text, image: null };
  }

  const seen = clean(await look(picture, mode.id === 'sketch' ? SEE_SKETCH : SEE, 'Looking at a picture'));
  if (!seen) throw new Error('The model could not describe the picture. Try a clearer one.');

  if (mode.id === 'sketch') {
    const image = canDraw() || deps.draw ? await draw(seen, choice.style).catch(() => null) : null;
    return { text: '', seen, image, ...(image ? {} : { note: canDraw() ? 'The picture could not be painted this time.' : 'Choose an image model in Models to paint the picture.' }) };
  }

  const future = choice.id.startsWith('future');
  const text = clean(await ask(
    'You write short vivid passages about places. Be grounded in how things really were or are likely to be. For the future, say plainly that it is imagined.',
    `A photo shows: ${seen}\n\nWrite five to seven sentences about what this place or scene looked like ${choice.text}${future ? ', as an imagined future (say it is imagined)' : ''}. Mention what people did there, what was different, and what stayed the same. Do not invent names, dates or numbers.`,
  ));
  const image = canDraw() || deps.draw ? await draw(await pictureDescription(text, ask), choice.style).catch(() => null) : null;
  return { text, seen, image, ...(image ? {} : { note: canDraw() ? 'The picture could not be painted this time.' : 'Choose an image model in Models to see a picture too.' }) };
}
