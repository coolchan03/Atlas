/**
 * Offline instrumental composition. A text LLM can suggest a bounded score, or the
 * deterministic built-in composer can create one without any model/download.
 * Output is original synthesised note audio, not singing or a licensed recording.
 */
import { composeStyled, isStyleMood, type StyleMood } from './styles';
import type { MusicNote, MusicRole, MusicScore, SoundPreset } from './types';
import { noteWave } from './instruments';

/** Sample rate of every rendered tune. 24 kHz keeps the top end that makes a piano or a cymbal sound like one. */
export const MUSIC_RATE = 24000;

export type MusicMood = 'study' | 'ambient' | 'cinematic' | 'electronic' | StyleMood;
export type { MusicRole, MusicNote, MusicScore, SoundPreset } from './types';

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function pitchNumber(name: string): number | null {
  const m = name.match(/^([A-G])([#b]?)([2-6])$/);
  if (!m) return null;
  const result = (Number(m[3]) + 1) * 12 + SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return result >= 36 && result <= 91 ? result : null;
}

/** One "NOTE pitch beat length [gain] [role]" line; null when it is malformed or out of range. */
function parseNoteLine(line: string): MusicNote | null {
  const args = line.split(/\s+/);
  if (args.length < 4 || args.length > 6) return null;
  const pitch = pitchNumber(args[1]);
  const beat = Number(args[2]), length = Number(args[3]);
  const gain = args[4] ? Number(args[4]) : 0.6;
  const role = args[5] || 'melody';
  if (pitch === null || ![beat, length, gain].every(Number.isFinite)) return null;
  // Reject oversized motifs outright instead of silently dropping a long note.
  if (beat > 96 || length > 12 || beat + length > 100) throw new Error('Instrumental score exceeded the motif limit.');
  if (beat < 0 || length < 0.125 || gain < 0.05 || gain > 1) return null;
  if (!['melody', 'pad', 'bass'].includes(role)) return null;
  return { pitch, beat, length, gain, role: role as MusicRole };
}

/** Reject malformed output, excessive note counts and scores that cannot play reliably on a phone. */
export function parseMusicScore(raw: string): MusicScore {
  const lines = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[^\n]*\n?/g, '').split(/\r?\n/);
  let title = 'Original instrumental';
  let bpm = 96;
  const notes: MusicNote[] = [];
  for (const original of lines) {
    const line = original.trim().replace(/^[-*]\s*/, '');
    if (/^TITLE:\s*/i.test(line)) title = line.slice(6).trim().slice(0, 70) || title;
    else if (/^BPM:\s*/i.test(line)) {
      const n = Number(line.slice(4).trim());
      if (Number.isInteger(n) && n >= 60 && n <= 165) bpm = n;
    } else if (/^NOTE\s+/i.test(line)) {
      const note = parseNoteLine(line);
      if (note) notes.push(note);
      if (notes.length >= 240) break;
    }
    // Lyrics and vocal requests are deliberately ignored: this tool is instrumental-only.
  }
  if (notes.length < 4) throw new Error('The model did not produce a playable instrumental score. Try another prompt or use Quick instrumental.');
  const seconds = Math.max(...notes.map((note) => note.beat + note.length)) * 60 / bpm;
  if (seconds > 90) throw new Error('Instrumental score exceeded the 90-second motif limit.');
  return { title, bpm, notes };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A coherent, seeded 8-bar instrumental: tonic chords, pulse bass and a diatonic melody. */
export function composeInstrumental(prompt: string, mood: MusicMood = 'study'): MusicScore {
  if (isStyleMood(mood)) return composeStyled(prompt, mood);
  const seed = hash(`${mood}:${prompt.toLowerCase().trim()}`);
  const minor = mood === 'cinematic' || mood === 'ambient';
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const bpm = ({ study: 92, ambient: 72, cinematic: 80, electronic: 118 } as Record<string, number>)[mood];
  const tonic = 48 + (seed % 5); // C3 to E3; the bass stays in an efficient range.
  const progression = minor ? [0, 5, 3, 4, 0, 3, 5, 4] : [0, 4, 5, 3, 0, 5, 3, 4];
  const notes: MusicNote[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const degree = progression[bar];
    const root = tonic + scale[degree];
    for (const offset of [0, 2, 4]) {
      const index = degree + offset;
      const pitch = tonic + scale[index % 7] + (index >= 7 ? 12 : 0) + 12;
      notes.push({ pitch, beat: bar * 4, length: 3.95, gain: mood === 'ambient' ? 0.16 : 0.22, role: 'pad' });
    }
    notes.push({ pitch: root - 12, beat: bar * 4, length: 3.65, gain: 0.25, role: 'bass' });
    for (let step = 0; step < 8; step++) {
      const noteIndex = (degree + (step % 3) * 2 + ((seed >>> (bar % 16)) % 3)) % 7;
      const melody = tonic + 24 + scale[noteIndex] + ((bar + step) % 9 === 0 ? 12 : 0);
      const gain = step % 2 ? 0.14 : 0.25;
      notes.push({ pitch: Math.min(90, melody), beat: bar * 4 + step * 0.5, length: 0.44, gain, role: 'melody' });
    }
  }
  const label = prompt.trim().replace(/[\r\n]+/g, ' ').slice(0, 56) || 'Background';
  return { title: `${label} (${mood})`, bpm, notes };
}

export interface RenderOptions { preset?: SoundPreset; rate?: number; seconds?: number }

/** Length of one pass through the score, after checking the score and sample rate are usable. */
function loopSeconds(score: MusicScore, rate: number): number {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || !score.notes.length) throw new Error('Invalid audio renderer settings');
  if (!Number.isFinite(score.bpm) || score.bpm < 60 || score.bpm > 165) throw new Error('Invalid BPM');
  return Math.max(...score.notes.map((note) => (note.beat + note.length) * 60 / score.bpm));
}

interface MixContext { bpm: number; preset: SoundPreset; rate: number; loopFrames: number; band?: MusicScore['band']; /** Notes already made, so a repeated chord or drum hit is built once. */ made: Map<string, Float32Array> }

/** Adds one note to the mix, repeating it every loop until the buffer is full. The note is made once and copied. */
function mixNote(buffer: Float32Array, note: MusicNote, { bpm, preset, rate, loopFrames, band, made }: MixContext): void {
  if (!Number.isFinite(note.pitch) || !Number.isFinite(note.beat) || !Number.isFinite(note.length) || !Number.isFinite(note.gain)) throw new Error('Invalid score note');
  const frames = buffer.length;
  const startInLoop = Math.round(note.beat * 60 / bpm * rate);
  const samples = Math.ceil(note.length * 60 / bpm * rate);
  if (samples < 1 || samples > rate * 14) throw new Error('Instrumental note too long');
  const key = `${note.pitch}|${samples}|${note.gain}|${note.role ?? 'melody'}|${note.voice ?? ''}`;
  let wave = made.get(key);
  if (!wave) { wave = noteWave(note, { samples, rate, preset, band }); made.set(key, wave); }
  for (let start = startInLoop; start < frames; start += loopFrames) {
    const end = Math.min(samples, frames - start);
    for (let i = 0; i < end; i++) buffer[start + i] += wave[i];
  }
}

/** A soft room echo and a light low-pass to take the edge off, in place. Pads get a longer echo. Returns the loudest sample. */
function echoAndSmooth(buffer: Float32Array, preset: SoundPreset, rate: number): number {
  const ambient = preset === 'ambient';
  const delay = Math.round(rate * (ambient ? 0.21 : 0.11));
  const echoGain = ambient ? 0.28 : 0.1;
  const smoothing = ambient ? 0.55 : 0.88;
  let filtered = 0;
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const raw = buffer[i] + (i >= delay ? buffer[i - delay] * echoGain : 0);
    filtered = smoothing * raw + (1 - smoothing) * filtered;
    buffer[i] = filtered;
    peak = Math.max(peak, Math.abs(filtered));
  }
  return peak;
}

/**
 * Produces a mono PCM16 WAV-ready waveform, with steady instrumental loops up to 120s.
 * Each note has a bounded attack/release, a soft echo and a final fade to prevent clicks.
 * Work and storage are capped; this does not run a generative audio diffusion model.
 */
export function renderMusic(score: MusicScore, { preset = 'keys', rate = MUSIC_RATE, seconds }: RenderOptions = {}): Int16Array {
  const baseSeconds = loopSeconds(score, rate);
  const requestedSeconds = seconds === undefined ? baseSeconds + 0.5 : seconds;
  if (!Number.isFinite(requestedSeconds) || requestedSeconds < 3 || requestedSeconds > 120) throw new Error('Instrumental duration must be 3–120 seconds');
  const frames = Math.ceil(requestedSeconds * rate);
  const buffer = new Float32Array(frames);
  const loopFrames = Math.max(1, Math.round(baseSeconds * rate));
  // "Style band" plays each part on the instrument the style was written for.
  const context = { bpm: score.bpm, preset, rate, loopFrames, band: preset === 'band' ? score.band : undefined, made: new Map() };
  for (const note of score.notes) mixNote(buffer, note, context);
  const peak = echoAndSmooth(buffer, preset, rate);
  const scale = peak > 0 ? 0.72 / peak : 0;
  const fadeIn = Math.max(1, Math.floor(rate * 0.08));
  const fadeOut = Math.max(1, Math.floor(rate * 0.8));
  const out = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const gain = Math.min(1, i / fadeIn, (frames - i - 1) / fadeOut);
    out[i] = Math.round(Math.max(-1, Math.min(1, buffer[i] * scale * Math.max(0, gain))) * 32767);
  }
  return out;
}
