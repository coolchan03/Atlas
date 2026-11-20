/**
 * The composer's last try before the built-in one. Many small models cannot keep a whole score straight (beat numbers, instruments,
 * loudness) but can write a melody as a list of notes. So the model is asked for only that: a title, a tempo and notes in order, each with
 * its length ("C5:2" is C5 for two beats, "-:1" a one-beat rest). The app places the notes one after another and builds the bass and the
 * chords from the plan it already worked out, so the tune is still the model's melody over a sound accompaniment. Pure.
 */
import { pitchNumber } from './composition';
import { RANGE, intoRange, type HarmonyPlan } from './theory';
import type { MusicNote, MusicScore, Voice } from './types';

export function melodySystemPrompt(): string {
  return `You write the melody of an instrumental tune. Reply with exactly three lines and nothing else:
TITLE: a short title
BPM: a number from 60 to 165
MELODY: the notes in order, separated by spaces. Each note is a pitch and its length in beats, like C5:1 or E5:0.5 or G5:2. Use - for a rest, like -:1.
Write 24 to 48 notes. Stay in the key you are given. Every bar is 4 beats long. Example:
TITLE: Window Rain
BPM: 84
MELODY: E5:1 G5:1 A5:2 G5:1 E5:1 D5:2 C5:1 D5:1 E5:2 -:1 C5:3`;
}

export interface Melody { title: string; bpm: number | null; notes: Array<{ pitch: number | null; length: number }> }

const TOKEN = /^([A-Ga-g][#b♯♭]?-?\d|-|r|rest)(?:[:/x*]\s*(\d+(?:\.\d+)?|\.\d+))?$/;

/** The title, tempo and notes in a reply. Any line with a run of note tokens counts, whatever it is called; other words are ignored. */
export function parseMelody(raw: string): Melody {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[^\n]*\n?/g, '');
  const title = /^\W*title\s*[:\-]\s*(.+)$/im.exec(text)?.[1]?.replace(/\*+/g, '').trim() ?? '';
  const bpmText = /^\W*(?:bpm|tempo)\s*[:\-]?\s*(\d{2,3})/im.exec(text)?.[1];
  const notes: Melody['notes'] = [];
  for (const line of text.split(/\r?\n/)) {
    const body = line.replace(/^\W*(?:melody|notes?)\s*[:\-]\s*/i, '');
    const tokens = body.replace(/[,|;]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const parsed = tokens.map((t) => TOKEN.exec(t));
    if (tokens.length < 4 || parsed.filter(Boolean).length < tokens.length * 0.8) continue; // not a melody line
    for (const m of parsed) {
      if (!m) continue;
      const length = Math.min(8, Math.max(0.25, Number(m[2] ?? 1) || 1));
      const rest = /^(-|r|rest)$/i.test(m[1]);
      const pitch = rest ? null : pitchNumber(m[1][0].toUpperCase() + m[1].slice(1).replace(/♯/g, '#').replace(/♭/g, 'b'));
      if (!rest && !Number.isFinite(pitch)) continue;
      notes.push({ pitch, length });
    }
  }
  return { title, bpm: bpmText ? Math.min(165, Math.max(60, Number(bpmText))) : null, notes };
}

/** The melody placed one note after another (cut at the end of the plan), with a bass line and chords from the plan under it. Null when too few notes. */
export function scoreFromMelody(melody: Melody, plan: HarmonyPlan, options: { title: string; bpm: number; band?: Partial<Record<'melody' | 'pad' | 'bass', Voice>>; minNotes?: number }): MusicScore | null {
  const end = plan.bars.length * plan.beatsPerBar;
  const notes: MusicNote[] = [];
  let beat = 0;
  let played = 0;
  for (const n of melody.notes) {
    if (beat >= end) break;
    const length = Math.min(n.length, end - beat);
    if (n.pitch !== null) { notes.push({ pitch: intoRange(n.pitch, RANGE.melody), beat, length, gain: 0.6, role: 'melody', voice: options.band?.melody }); played += 1; }
    beat += length;
  }
  if (played < (options.minNotes ?? 8)) return null;
  for (const bar of plan.bars) {
    const start = bar.bar * plan.beatsPerBar;
    notes.push({ pitch: intoRange(bar.root, RANGE.bass), beat: start, length: plan.beatsPerBar, gain: 0.45, role: 'bass', voice: options.band?.bass });
    for (const tone of bar.tones.slice(0, 3)) notes.push({ pitch: intoRange(tone + 60, RANGE.pad), beat: start, length: plan.beatsPerBar, gain: 0.22, role: 'pad', voice: options.band?.pad });
  }
  return { title: options.title, bpm: options.bpm, notes, band: options.band as MusicScore['band'] };
}
