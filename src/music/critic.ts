/**
 * The composer's second pair of ears. After the model has written a tune and theory.ts has put its notes in key, this file listens the way
 * a teacher would: is there a melody in every part of the tune, does a short idea come back, does it move by step, does the rhythm vary,
 * is there a bass and harmony, does the tune end on the home note? Each question is a measurement (not a guess), so the answer is the same
 * every time and is tested without a phone. A weak tune gets the list of what is wrong back to the model for ONE rewrite; the better of
 * the two is kept. `finishScore` then does the two things a score always needs and a small model forgets: it ends on the tonic, and it
 * fades in and out.
 */
import type { HarmonyPlan } from './theory';
import type { MusicNote, MusicScore } from './types';

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const melodyOf = (s: MusicScore): MusicNote[] => s.notes.filter((n) => (n.role ?? 'melody') === 'melody').sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);

export interface Critique {
  /** 0 to 100. */
  score: number;
  /** Plain sentences, worst first, written so they can be handed to the model as instructions. */
  issues: string[];
  stats: { barsWithMelody: number; stepwise: number; motifReturn: number; distinctLengths: number; range: number; hasBass: boolean; hasHarmony: boolean };
}

/** The melody's shape in a bar as the steps between its notes, so a repeated idea matches even when it starts on another note. */
function contourOf(notes: MusicNote[]): string {
  return notes.slice(1).map((n, i) => Math.sign(n.pitch - notes[i].pitch)).join('');
}

export function critiqueScore(score: MusicScore, plan: HarmonyPlan): Critique {
  const bars = plan.bars.length;
  const bpb = plan.beatsPerBar;
  const melody = melodyOf(score);
  const barNotes: MusicNote[][] = Array.from({ length: bars }, () => []);
  for (const n of melody) {
    const b = Math.floor(n.beat / bpb + 1e-6);
    if (b >= 0 && b < bars) barNotes[b].push(n);
  }
  const barsWithMelody = barNotes.filter((b) => b.length > 0).length;

  let steps = 0; let pairs = 0;
  melody.forEach((n, i) => { if (i) { pairs += 1; if (Math.abs(n.pitch - melody[i - 1].pitch) <= 2) steps += 1; } });
  const stepwise = pairs ? steps / pairs : 0;

  const seen = new Set<string>(); let returns = 0; let counted = 0;
  for (const b of barNotes) {
    if (b.length < 3) continue;
    const c = contourOf(b);
    counted += 1;
    if (seen.has(c)) returns += 1; else seen.add(c);
  }
  const motifReturn = counted ? returns / counted : 0;

  const distinctLengths = new Set(melody.map((n) => Math.round(n.length * 4) / 4)).size;
  const pitches = melody.map((n) => n.pitch);
  const range = pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;
  const bass = score.notes.filter((n) => n.role === 'bass');
  const pad = score.notes.filter((n) => n.role === 'pad');
  const hasBass = bass.length >= Math.ceil(bars / 2);
  const hasHarmony = pad.length >= Math.ceil(bars / 2) || bass.length >= bars; // chords may be played by the bass line in sparse styles

  const issues: Array<[number, string]> = [];
  let points = 100;
  const lose = (n: number, text: string) => { points -= n; issues.push([n, text]); };
  if (!melody.length) lose(60, 'There is no melody. Write a melody on top of the chords.');
  else {
    if (barsWithMelody < Math.ceil(bars * 0.7)) lose(18, `The melody is in only ${barsWithMelody} of ${bars} bars. Give the melody something in almost every bar, with small rests.`);
    if (stepwise < 0.5) lose(14, 'The melody leaps too much. Move mostly by step (one scale note up or down) and turn back after a leap.');
    if (motifReturn < 0.2) lose(14, 'No short idea comes back. Write a motif of 3 to 5 notes in bar 1 and repeat it, changed a little, in later bars.');
    else if (motifReturn > 0.85) lose(8, 'The melody repeats itself every bar. Change the idea in every second phrase.');
    if (distinctLengths < 3) lose(10, 'Every note has the same length. Mix long and short notes and add rests.');
    if (range < 7) lose(8, 'The melody stays in a very small range. Let it rise toward the middle of the tune and settle at the end.');
  }
  if (!hasBass) lose(12, 'There is no bass. Add a bass playing the root of each bar\'s chord on its first beat.');
  if (!hasHarmony) lose(10, 'There are no chords. Add a pad or chord instrument playing the notes of each bar\'s chord.');
  const instruments = new Set(score.notes.map((n) => String(n.voice ?? n.role)));
  if (instruments.size < 3) lose(8, 'Use at least 3 different instruments: a bass, chords and a melody on different sounds.');

  issues.sort((a, b) => b[0] - a[0]);
  return { score: Math.max(0, points), issues: issues.map(([, t]) => t), stats: { barsWithMelody, stepwise, motifReturn, distinctLengths, range, hasBass, hasHarmony } };
}

/** Below this the tune is sent back once with the list of issues. */
export const REWRITE_BELOW = 75;

/** What the model is told when a tune is sent back: what is wrong, and to keep what is fine. */
export function rewriteRequest(brief: string, c: Critique): string {
  return `${brief}\n\nYour last score was playable but weak. Fix these, and keep everything that was already good:\n${c.issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}\nReply with the whole score again, using only TITLE, BPM, NOTE and DRUM lines.`;
}

/**
 * Two finishing touches, both done in code: the last melody note and the last bass note land on the tonic and are held to the end of the
 * tune, and the loudness fades in over the first bar and out over the last two. Returns a new score.
 */
export function finishScore(score: MusicScore, plan: HarmonyPlan): MusicScore {
  const bpb = plan.beatsPerBar;
  const end = plan.bars.length * bpb;
  const lastMelody = melodyOf(score).at(-1);
  const lastBass = score.notes.filter((n) => n.role === 'bass').sort((a, b) => a.beat - b.beat).at(-1);
  const toTonic = (pitch: number) => {
    const up = pitch + mod12(plan.tonic - pitch);
    return up - pitch > 6 ? up - 12 : up;
  };
  const notes = score.notes.map((n): MusicNote => {
    let { pitch, length } = n;
    if (n === lastMelody || n === lastBass) {
      pitch = toTonic(pitch);
      length = Math.max(length, Math.min(4, end - n.beat));
    }
    let gain = n.gain;
    if (n.beat < bpb) gain *= 0.8;
    else if (n.beat >= end - bpb * 2) gain *= n.beat >= end - bpb ? 0.65 : 0.85;
    return { ...n, pitch, length, gain: Math.max(0.05, Math.min(1, Math.round(gain * 100) / 100)) };
  });
  return { ...score, notes };
}
