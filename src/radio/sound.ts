/**
 * The sound of a radio song. A small model is shown the whole list of styles and instruments in Music Studio and the description of the
 * song, and answers with one line of JSON: a style and up to four instruments. Code checks every name against the lists (a name that is
 * not there is dropped), so a tiny model only has to choose, never to write notes. The built-in composer then writes the tune for that
 * style and band, so the music is always valid. If the model gives nothing usable, the dice's own genre is used.
 */
import { INSTRUMENTS, instrumentById } from '../music/catalog';
import { composeFromSpec, seedFor } from '../music/arrange';
import { STYLES, isStyleMood, specFor, type Energy, type StyleMood } from '../music/styles';
import type { Extra } from '../music/styleTypes';
import type { MusicScore, Voice } from '../music/types';
import { describeShow, type Show } from './dice';

export interface Sound { style: StyleMood; instruments: Voice[]; by: 'ai' | 'dice' }
/** What the radio asks of the model: a question, and optionally a grammar the answer must follow and a cap on its length. */
export interface AskOptions { grammar?: string; maxTokens?: number }
export type AskModel = (system: string, user: string, options?: AskOptions) => Promise<string>;

const MAX_INSTRUMENTS = 4;
const STYLE_LIST = (Object.keys(STYLES) as StyleMood[]).join(', ');
const INSTRUMENT_LIST = INSTRUMENTS.map((i) => i.id).join(', ');

/** The answer must be this JSON with a style and instruments from the lists, so a small model cannot answer in any other shape. */
export function soundGrammar(): string {
  const styles = (Object.keys(STYLES) as StyleMood[]).map((s) => `"${s}"`).join(' | ');
  const instruments = INSTRUMENTS.map((i) => `"${i.id}"`).join(' | ');
  return [`root ::= "{\\"style\\":\\"" style "\\",\\"instruments\\":[" inst ("," inst){1,3} "]}"`, `style ::= ${styles}`, `inst ::= "\\"" instrument "\\""`, `instrument ::= ${instruments}`].join('\n');
}

export const SOUND_SYSTEM = `You choose the sound of a radio song. Answer with ONE line of JSON and nothing else: {"style":"<style>","instruments":["<instrument>","<instrument>"]}
Pick the style that fits best from this list: ${STYLE_LIST}
Pick two to four instruments that fit from this list: ${INSTRUMENT_LIST}
Example. Song: a calm lullaby about a baby. Answer: {"style":"lullaby","instruments":["harp","musicbox","warmpad"]}`;

export function soundQuestion(show: Show, theme: string): string {
  const station = theme.trim() ? `Station theme: ${theme.trim().slice(0, 160)}\n` : '';
  return `${station}Song: ${describeShow(show)}. Suggested style: ${show.genre.style}.\nAnswer:`;
}

/** Reads the model's answer. Unknown styles and instruments are dropped; `style` is null when none was usable. */
export function parseSound(raw: string): { style: StyleMood | null; instruments: Voice[] } {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  let style: StyleMood | null = null;
  let names: unknown[] = [];
  try {
    const parsed = json ? JSON.parse(json) : {};
    const s = typeof parsed.style === 'string' ? parsed.style.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    style = isStyleMood(s) ? s : null;
    names = Array.isArray(parsed.instruments) ? parsed.instruments : [];
  } catch { /* an answer that is not JSON gives nothing usable */ }
  const instruments = [...new Set(names.map((n) => String(n).trim().toLowerCase()).filter((n) => instrumentById(n)))].slice(0, MAX_INSTRUMENTS) as Voice[];
  return { style, instruments };
}

/** The dice's own sound: the genre's style and the instruments it leans on, with the rolled spotlight. */
export function diceSound(show: Show): Sound {
  const lean = [...(show.genre.lean ?? []), ...(show.spotlight ? [show.spotlight] : [])].filter((n) => instrumentById(n));
  return { style: show.genre.style, instruments: [...new Set(lean)].slice(0, MAX_INSTRUMENTS) as Voice[], by: 'dice' };
}

/** Asks the model for the sound; the dice's sound stands in when the answer is unusable or the model cannot be reached. */
export async function chooseSound(show: Show, theme: string, ask: AskModel): Promise<Sound> {
  const fallback = diceSound(show);
  try {
    const { style, instruments } = parseSound(await ask(SOUND_SYSTEM, soundQuestion(show, theme), { grammar: soundGrammar(), maxTokens: 60 }));
    if (!style) return fallback;
    // A rolled spotlight is kept even when the model did not name it.
    const withSpotlight = show.spotlight && instrumentById(show.spotlight) && !instruments.includes(show.spotlight as Voice) ? [...instruments, show.spotlight as Voice].slice(-MAX_INSTRUMENTS) : instruments;
    return { style, instruments: withSpotlight, by: 'ai' };
  } catch { return fallback; }
}

/** The style's spec with the chosen instruments in its band: the first melody instrument leads, the first harmony one holds the chords, the first bass one plays the bass, the rest join in. */
export function bandFor(style: StyleMood, instruments: Voice[]): { band: ReturnType<typeof specFor>['band']; extras: Extra[] } {
  const base = specFor(style);
  const infos = instruments.map((v) => instrumentById(v)).filter((i): i is NonNullable<typeof i> => !!i);
  const lead = infos.find((i) => i.part === 'melody'); const chords = infos.find((i) => i.part === 'harmony'); const low = infos.find((i) => i.part === 'bass');
  const used = new Set([lead, chords, low].filter(Boolean));
  const extras: Extra[] = infos.filter((i) => !used.has(i)).slice(0, 3).map((i) => ({ voice: i.id, kind: i.part === 'melody' ? 'answer' : i.family === 'tuned percussion' ? 'sparkle' : 'swell' }));
  const band = { ...(base.band ?? {}), ...(lead ? { melody: lead.id } : {}), ...(chords ? { pad: chords.id } : {}), ...(low ? { bass: low.id } : {}) };
  return { band, extras: extras.length ? extras : base.extras ?? [] };
}

/** The tune for a show: one pass of 16 bars that the player loops. The same show always makes the same tune. */
export function tuneFor(show: Show, sound: Sound, title: string): MusicScore {
  const base = specFor(sound.style);
  const { band, extras } = bandFor(sound.style, sound.instruments);
  const tempo: Record<Energy, number> = { calm: 0.86, medium: 1, lively: 1.14 };
  const bump: Record<Energy, number> = { calm: -1, medium: 0, lively: 1 };
  const spec = { ...base, band, extras, bpm: Math.max(60, Math.min(165, Math.round(base.bpm * tempo[show.energy]))), density: Math.max(1, base.density + bump[show.energy]) };
  return { title, bpm: spec.bpm, notes: composeFromSpec(spec, seedFor(`${title}#${show.seed}`, sound.style)), band };
}
