/**
 * Reading a tune written by the composer agent. The format is one fact per line so a small model can write it:
 *   TITLE: Rainy Window       BPM: 84
 *   NOTE C4 0 1 0.6 piano     (pitch, start beat, length in beats, loudness 0.05-1, instrument)
 *   DRUM kick 0 0.8           (drum, start beat, loudness)
 * Every line is checked: unknown instruments, out-of-range pitches and impossible timings are dropped, and a tune that has too few good
 * notes is refused so the caller can fall back to the built-in composer. Nothing the model says is played unchecked.
 */
import { instrumentById } from './catalog';
import { isDrumKind } from './instruments';
import { pitchNumber } from './composition';
import type { DrumKind, MusicNote, MusicScore, Voice } from './types';

export const MAX_NOTES = 700;
export const MAX_BEATS = 128;
export const MIN_GOOD_NOTES = 12;
const DRUM_LENGTH: Record<DrumKind, number> = { kick: 0.25, snare: 0.25, hat: 0.2, openhat: 0.5, clap: 0.25, tom: 0.4, rim: 0.15, cowbell: 0.4, shaker: 0.25, crash: 3 };

export interface AgentScoreReport { score: MusicScore; instruments: string[]; drums: string[]; dropped: number }

const clean = (raw: string): string[] => raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[^\n]*\n?/g, '').split(/\r?\n/).map((l) => l.trim().replace(/^[-*]\s*/, '')).filter(Boolean);

function parseNote(parts: string[]): MusicNote | null {
  if (parts.length < 6) return null;
  const pitch = pitchNumber(parts[1].replace(/[♯]/g, '#').replace(/[♭]/g, 'b'));
  const beat = Number(parts[2]); const length = Number(parts[3]); const gain = Number(parts[4]); const voice = parts[5].toLowerCase();
  const info = instrumentById(voice);
  if (pitch === null || !info || ![beat, length, gain].every(Number.isFinite)) return null;
  if (beat < 0 || beat >= MAX_BEATS || length < 0.125 || length > 16 || beat + length > MAX_BEATS + 8 || gain < 0.05 || gain > 1) return null;
  return { pitch, beat, length, gain, role: info.part === 'bass' ? 'bass' : info.part === 'harmony' ? 'pad' : 'melody', voice: info.id as Voice };
}

function parseDrum(parts: string[]): MusicNote | null {
  if (parts.length < 4) return null;
  const kind = parts[1].toLowerCase();
  const beat = Number(parts[2]); const gain = Number(parts[3]);
  if (!isDrumKind(kind) || !Number.isFinite(beat) || !Number.isFinite(gain) || beat < 0 || beat >= MAX_BEATS || gain < 0.05 || gain > 1) return null;
  return { pitch: 48, beat, length: DRUM_LENGTH[kind], gain, role: 'perc', voice: kind };
}

/** The tune in a reply, checked line by line. Throws a readable message when there is not enough good music to play. */
export function parseAgentScore(raw: string): AgentScoreReport {
  let title = 'Original instrumental';
  let bpm = 96;
  const notes: MusicNote[] = [];
  let dropped = 0;
  for (const line of clean(raw)) {
    const parts = line.split(/\s+/);
    const head = parts[0].toUpperCase().replace(/:$/, '');
    if (head === 'TITLE') title = line.replace(/^title:?\s*/i, '').slice(0, 70) || title;
    else if (head === 'BPM') { const n = Number(parts[1]); if (Number.isInteger(n) && n >= 60 && n <= 165) bpm = n; }
    else if (head === 'NOTE' || head === 'DRUM') {
      const note = head === 'NOTE' ? parseNote(parts) : parseDrum(parts);
      if (note && notes.length < MAX_NOTES) notes.push(note); else dropped++;
    }
  }
  if (notes.length < MIN_GOOD_NOTES) throw new Error('The composer did not write enough playable notes.');
  const seconds = Math.max(...notes.map((n) => n.beat + n.length)) * 60 / bpm;
  if (seconds > 100) throw new Error('The tune is longer than the 100 seconds one pass may take.');
  if (!notes.some((n) => n.role !== 'perc')) throw new Error('The tune has only drums.');
  const instruments = [...new Set(notes.filter((n) => n.role !== 'perc').map((n) => instrumentById(n.voice as string)?.label ?? String(n.voice)))];
  const drums = [...new Set(notes.filter((n) => n.role === 'perc').map((n) => String(n.voice)))];
  return { score: { title, bpm, notes }, instruments, drums, dropped };
}
