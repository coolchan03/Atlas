/**
 * Photo studio modes as data. Each mode says what to do with a picture and what the person can choose (a voice for the
 * narrator, a time for the time machine, a look for the picture). The service reads it and runs the steps.
 */

import { styleById } from '../skills/photoStyles';

export interface PhotoChoice { id: string; label: string; /** Goes into the prompt. */ text: string; /** How a drawn picture should look. */ style?: string; /** One sentence shown under the choice. */ detail?: string }

export type PhotoModeId = 'narrate' | 'time' | 'sketch';

export interface PhotoMode {
  id: PhotoModeId;
  label: string;
  blurb: string;
  /** What the choices are, as a heading. */
  choiceLabel: string;
  choices: PhotoChoice[];
  /** The mode makes a picture too (when an image model is chosen). */
  draws: boolean;
}

/** The looks a sketch can be painted in, from the shared style guide (the same one the photo-styles skill carries). */
const SKETCH_LOOKS = ['realistic', 'anime', 'cartoon', 'watercolor', 'oil', 'pencil', 'pixel', 'render3d', 'comic', 'vector'];
function lookOf(id: string): PhotoChoice {
  const s = styleById(id)!;
  return { id: s.id, label: s.label, text: s.label.toLowerCase(), style: s.keywords, detail: s.summary };
}

export const PHOTO_MODES: PhotoMode[] = [
  {
    id: 'narrate', label: 'Narrator', blurb: 'Point at anything and hear it described in the voice you pick. It only says what is really in the picture.',
    choiceLabel: 'VOICE', draws: false,
    choices: [
      { id: 'nature', label: 'Nature documentary', text: 'a calm nature documentary presenter, hushed and wondering' },
      { id: 'sports', label: 'Sports commentator', text: 'an excited sports commentator calling a match' },
      { id: 'guide', label: 'Calm guide', text: 'a calm, clear guide helping someone who cannot see the picture' },
      { id: 'museum', label: 'Museum guide', text: 'a museum guide pointing out what is worth noticing' },
    ],
  },
  {
    id: 'time', label: 'Time machine', blurb: 'The same place a long time ago or far ahead: a short passage, and a picture if you have an image model.',
    choiceLabel: 'WHEN', draws: true,
    choices: [
      { id: 'past100', label: '100 years ago', text: 'about 100 years ago', style: 'old black and white photograph, film grain' },
      { id: 'past50', label: '50 years ago', text: 'about 50 years ago', style: 'faded 1970s colour photograph' },
      { id: 'future50', label: '50 years ahead', text: 'about 50 years in the future', style: 'near-future concept art, realistic' },
      { id: 'future100', label: '100 years ahead', text: 'about 100 years in the future', style: 'futuristic concept art, detailed' },
    ],
  },
  {
    id: 'sketch', label: 'Sketch to picture', blurb: 'Photograph a drawing. Atlas describes it and paints a finished picture from the description. It re-imagines the sketch; it does not trace the lines.',
    choiceLabel: 'LOOK', draws: true,
    choices: SKETCH_LOOKS.map((id) => lookOf(id)),
  },
];

export const modeById = (id: PhotoModeId): PhotoMode => PHOTO_MODES.find((m) => m.id === id) ?? PHOTO_MODES[0];
export const choiceOf = (mode: PhotoMode, id: string | undefined): PhotoChoice => mode.choices.find((c) => c.id === id) ?? mode.choices[0];
