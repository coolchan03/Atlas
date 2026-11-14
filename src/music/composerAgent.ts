/**
 * The hidden composer. When the chat model is asked for music it does not write notes itself: it hands the request to this agent, a
 * second pass of the on-phone model under a prompt that makes it do one job only, writing a score, with a long list of instruments to
 * choose from. The agent never appears in the agent list and has no tools or chat; only `composeMusic` and the make_music tool reach it.
 * What it writes is checked line by line (agentScore.ts); if it cannot produce a playable tune the built-in composer makes one, so a
 * request for music always ends in music. This is a specialist prompt, not a separately trained model.
 */
import { instrumentsForPrompt } from './catalog';
import { parseAgentScore, type AgentScoreReport } from './agentScore';
import { composeStyled, specFor, type StyleMood } from './styles';
import { instrumentsOf, styleFromText, styleLabel } from './simple';
import type { MusicScore } from './types';

/** Not an entry in the agent store on purpose: nothing lists it, edits it or chats with it. */
export const COMPOSER_AGENT = { id: '__atlas-composer__', hidden: true, name: 'Atlas composer' } as const;

export function composerSystemPrompt(): string {
  return `You are a composer and arranger. You do one thing only: you write instrumental music as a score in the exact line format below. You never write lyrics, never chat, never explain. Reply with the score lines and nothing else.

FORMAT (one fact per line):
TITLE: a short title
BPM: a whole number from 60 to 165
NOTE <pitch> <start beat> <length in beats> <loudness 0.05-1> <instrument>
DRUM <drum> <start beat> <loudness 0.05-1>

PITCH is a note name with octave: C4, F#3, Bb5. Middle C is C4. Stay inside each instrument's range.
BEATS count from 0. A bar of 4/4 is 4 beats, so bar 1 starts at beat 0, bar 2 at beat 4, bar 3 at beat 8.
LOUDNESS: melody 0.45-0.7, chords and pads 0.2-0.4, bass 0.4-0.6, drums 0.3-0.8.

INSTRUMENTS you may use (use the id):
${instrumentsForPrompt()}

HOW TO WRITE IT
- Pick a key and stay in it. Use a chord progression of 4 chords repeating (for example I-vi-IV-V), one chord per bar or two.
- Give every part its job: a bass line on the chord roots, chords or a pad in the middle, a melody on top, and drums if the style needs a beat.
- Use 3 to 6 different instruments. Choose them to fit the style and the mood the user asked for. Do not put everything on the piano.
- Build it: start sparse, add instruments, bring the melody in, and end by thinning out. Repeat a short melody idea with small changes so it is memorable.
- Notes in a chord start on the same beat. Melody notes follow one after another, 0.5 to 2 beats long. Leave small rests.
- Drums for a steady beat in 4/4: kick on beats 0 and 2, snare on 1 and 3, hat every half beat. Skip drums for calm styles.
- Write the exact number of bars you are asked for, no more.

EXAMPLE (2 bars, shortened):
TITLE: Window Rain
BPM: 84
NOTE C3 0 4 0.45 upright
NOTE C4 0 4 0.25 warmpad
NOTE E4 0 4 0.25 warmpad
NOTE G4 0 4 0.25 warmpad
NOTE E5 0 1.5 0.55 flute
NOTE D5 1.5 0.5 0.5 flute
NOTE C5 2 2 0.55 flute
DRUM hat 0 0.4
DRUM hat 0.5 0.3`;
}

export interface ComposeOptions { seconds?: number; /** Replaces the model call (tests, and callers that already hold a model). */ ask?: (system: string, user: string) => Promise<string>; style?: StyleMood }
export interface Composed { score: MusicScore; via: 'composer' | 'built-in'; instruments: string; style: StyleMood; note: string }

const clampSeconds = (s: number | undefined) => Math.max(20, Math.min(120, Math.round(s ?? 60)));

/** What the agent is told about this request: the wanted style and mood in words, a tempo, a length in bars, and the instruments that suit it. */
export function composerBrief(request: string, style: StyleMood, seconds: number): { text: string; bars: number; bpm: number } {
  const spec = specFor(style);
  const bars = Math.max(8, Math.min(32, Math.round((Math.min(seconds, 90) * spec.bpm) / 60 / 4)));
  const text = `Request: ${request.trim().slice(0, 300) || 'background music'}\nStyle: ${styleLabel(style)}. Suggested tempo about ${spec.bpm} BPM. Instruments that suit it: ${instrumentsOf(style)}, and any others from the list that fit.\nWrite exactly ${bars} bars (${bars * 4} beats). Reply with the score lines only.`;
  return { text, bars, bpm: spec.bpm };
}

async function askModelDefault(system: string, user: string): Promise<string> {
  const { askModel } = require('../study/engine');
  return askModel(system, user);
}

/** Writes a tune for a request: the composer agent first (twice if the first score is unusable), then the built-in composer. */
export async function composeMusic(request: string, options: ComposeOptions = {}): Promise<Composed> {
  const seconds = clampSeconds(options.seconds);
  const style = options.style ?? styleFromText(request) ?? 'focus';
  const brief = composerBrief(request, style, seconds);
  const ask = options.ask ?? askModelDefault;
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await ask(composerSystemPrompt(), attempt ? `${brief.text}\n\nYour last score could not be used (${problem}). Write it again using only TITLE, BPM, NOTE and DRUM lines.` : brief.text);
      const report: AgentScoreReport = parseAgentScore(raw);
      const instruments = [...report.instruments, ...report.drums.map((d) => `${d} drum`)].join(', ');
      return { score: report.score, via: 'composer', instruments, style, note: `Written by the composer with ${instruments}.` };
    } catch (e: any) {
      problem = String(e?.message || e);
      if (/no model|could not be loaded|failed to load/i.test(problem)) break; // no point asking again
    }
  }
  const built = composeStyled(request, style);
  return { score: built, via: 'built-in', instruments: instrumentsOf(style), style, note: `The composer could not write a usable score (${problem}), so the built-in ${styleLabel(style)} composer made this tune with ${instrumentsOf(style)}.` };
}

/** What the make_music tool does: compose, render, save to the music library and start playing. Returns the words the chat model gives back. */
export async function makeMusicForChat(args: { description?: unknown; seconds?: unknown; style?: unknown }): Promise<string> {
  const description = typeof args.description === 'string' ? args.description.trim() : '';
  if (!description) throw new Error('Missing required parameter: description (what the music should be like)');
  const seconds = clampSeconds(Number(args.seconds) || undefined);
  const styleWord = typeof args.style === 'string' ? styleFromText(args.style) : null;
  const composed = await composeMusic(description, { seconds, style: styleWord ?? undefined });
  const { saveInstrumental } = require('./saveTrack');
  const track = await saveInstrumental(composed.score, { mood: composed.style, seconds, by: composed.via === 'composer' ? COMPOSER_AGENT.name : 'built-in composer' });
  let playing = 'It is saved in Music Studio.';
  try { await require('./backgroundPlayer').instrumentalPlayer.play(track); playing = 'It is playing now and saved in Music Studio.'; } catch { /* saved, not started */ }
  return `Made "${track.title}" (${Math.round(composed.score.bpm)} BPM, about ${seconds} seconds, ${styleLabel(composed.style)}). ${composed.note} ${playing} Do not write notes or lyrics yourself; tell the user briefly what was made.`;
}
