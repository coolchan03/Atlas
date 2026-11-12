/**
 * Offline instrumental composition. A text LLM can suggest a bounded score, or the
 * deterministic built-in composer can create one without any model/download.
 * Output is original synthesised note audio, not singing or a licensed recording.
 */
import { composeStyled, isStyleMood, type StyleMood } from './styles';
import type { MusicNote, MusicRole, MusicScore } from './types';

export type MusicMood = 'study' | 'ambient' | 'cinematic' | 'electronic' | StyleMood;
export type SoundPreset = 'keys' | 'bell' | 'synth' | 'ambient';
export type { MusicRole, MusicNote, MusicScore } from './types';

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

/** Same noise every time, so a rendered tune never changes between plays. */
const noise = (i: number) => (((Math.imul(i, 1103515245) + 12345) >>> 16) & 0x7fff) / 16384 - 1;

/** One percussion hit: a low pitch is a soft kick, a high pitch is a short tick. */
function percSample(note: MusicNote, i: number, rate: number): number {
  const t = i / rate;
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  if (note.pitch < 60) return Math.sin(2 * Math.PI * hz * 1.6 * t * Math.exp(-t * 14)) * Math.exp(-t * 16);
  return noise(i) * Math.exp(-t * (note.pitch > 85 ? 60 : 24));
}

function tone(theta: number, preset: SoundPreset, role: MusicRole): number {
  const s = Math.sin(theta), h2 = Math.sin(theta * 2);
  if (role === 'bass') return 0.8 * s + 0.12 * h2;
  if (preset === 'bell') return s + 0.22 * Math.sin(theta * 2.7);
  if (preset === 'synth') return s + 0.28 * h2 + 0.1 * Math.sin(theta * 3);
  if (preset === 'ambient' || role === 'pad') return s + 0.16 * Math.sin(theta * 2.005);
  return s + 0.17 * h2 + 0.07 * Math.sin(theta * 3);
}

export interface RenderOptions { preset?: SoundPreset; rate?: number; seconds?: number }

/** Length of one pass through the score, after checking the score and sample rate are usable. */
function loopSeconds(score: MusicScore, rate: number): number {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || !score.notes.length) throw new Error('Invalid audio renderer settings');
  if (!Number.isFinite(score.bpm) || score.bpm < 60 || score.bpm > 165) throw new Error('Invalid BPM');
  return Math.max(...score.notes.map((note) => (note.beat + note.length) * 60 / score.bpm));
}

interface MixContext { bpm: number; preset: SoundPreset; rate: number; loopFrames: number }

/** Adds one note to the mix, repeating it every loop until the buffer is full. */
function mixNote(buffer: Float32Array, note: MusicNote, { bpm, preset, rate, loopFrames }: MixContext): void {
  if (!Number.isFinite(note.pitch) || !Number.isFinite(note.beat) || !Number.isFinite(note.length) || !Number.isFinite(note.gain)) throw new Error('Invalid score note');
  const frames = buffer.length;
  const startInLoop = Math.round(note.beat * 60 / bpm * rate);
  const samples = Math.ceil(note.length * 60 / bpm * rate);
  if (samples < 1 || samples > rate * 14) throw new Error('Instrumental note too long');
  const hz = 440 * 2 ** ((note.pitch - 69) / 12);
  const role = note.role ?? 'melody';
  if (role === 'perc') {
    for (let start = startInLoop; start < frames; start += loopFrames) {
      for (let i = 0; i < samples && start + i < frames; i++) buffer[start + i] += percSample(note, i, rate) * note.gain;
    }
    return;
  }
  for (let start = startInLoop; start < frames; start += loopFrames) {
    for (let i = 0; i < samples && start + i < frames; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / (role === 'pad' ? 0.24 : 0.014));
      const release = Math.min(1, (samples - i) / (rate * (role === 'pad' ? 0.33 : 0.07)));
      const shape = preset === 'bell' ? Math.exp(-2.4 * i / samples) : (role === 'bass' ? 0.66 : 0.82);
      buffer[start + i] += tone(2 * Math.PI * hz * t, preset, role) * attack * release * shape * note.gain;
    }
  }
}

/** Gentle damped room echo followed by a low-pass smoothing stage, in place. Returns the loudest sample. */
function echoAndSmooth(buffer: Float32Array, preset: SoundPreset, rate: number): number {
  const ambient = preset === 'ambient';
  const delay = Math.round(rate * (ambient ? 0.23 : 0.12));
  const echoGain = ambient ? 0.16 : 0.08;
  const smoothing = ambient ? 0.15 : 0.42;
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
export function renderMusic(score: MusicScore, { preset = 'keys', rate = 16000, seconds }: RenderOptions = {}): Int16Array {
  const baseSeconds = loopSeconds(score, rate);
  const requestedSeconds = seconds === undefined ? baseSeconds + 0.5 : seconds;
  if (!Number.isFinite(requestedSeconds) || requestedSeconds < 3 || requestedSeconds > 120) throw new Error('Instrumental duration must be 3–120 seconds');
  const frames = Math.ceil(requestedSeconds * rate);
  const buffer = new Float32Array(frames);
  const loopFrames = Math.max(1, Math.round(baseSeconds * rate));
  const context = { bpm: score.bpm, preset, rate, loopFrames };
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
