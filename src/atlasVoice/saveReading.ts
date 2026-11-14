import RNFS from 'react-native-fs';
import { cleanForReading, prepareReadVoice } from './readAloud';
import { synthesizeToFile, ttsAvailable } from './tts';

/**
 * Saves a reading as one audio file in the chosen voice, to listen to elsewhere. The sound is made on the phone and held in memory
 * before it is written, so a single file is limited to about 20 minutes of speech; longer text is cut at the end of a sentence and
 * the result says how much was left out.
 */
export const MAX_SAVE_CHARS = 20_000;

export interface SavedReading { path: string; savedChars: number; totalChars: number }

/** The text that fits one file: whole sentences up to the limit. */
export function textForFile(text: string): string {
  const clean = cleanForReading(text);
  if (clean.length <= MAX_SAVE_CHARS) return clean;
  const cut = clean.slice(0, MAX_SAVE_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'));
  return end > MAX_SAVE_CHARS / 2 ? cut.slice(0, end + 1) : cut;
}

const slug = (title: string) => title.replace(/\.[A-Za-z0-9]{1,5}$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'reading';

export async function saveReadingAsAudio(text: string, title: string): Promise<SavedReading> {
  if (!ttsAvailable()) throw new Error('Saving audio needs the Android voice engine, which is not available in this build.');
  const body = textForFile(text);
  if (!body.trim()) throw new Error('There is no text to save.');
  await prepareReadVoice();
  const dir = `${RNFS.DocumentDirectoryPath}/read-aloud`;
  await RNFS.mkdir(dir);
  const path = `${dir}/${slug(title)}-${Date.now()}.wav`;
  await synthesizeToFile(body, path);
  return { path, savedChars: body.length, totalChars: cleanForReading(text).length };
}
