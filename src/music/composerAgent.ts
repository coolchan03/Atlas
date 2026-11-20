/**
 * The hidden composer. When the chat model is asked for music it does not write notes itself: it hands the request to this agent, a
 * second pass of the on-phone model under a prompt that makes it do one job only, writing a score, with a long list of instruments to
 * choose from. The agent never appears in the agent list and has no tools or chat; only `composeMusic` and the make_music tool reach it.
 * What it writes is checked line by line (agentScore.ts); if it cannot produce a playable tune the built-in composer makes one, so a
 * request for music always ends in music. This is a specialist prompt, not a separately trained model.
 */
import { INSTRUMENTS, instrumentById, instrumentsForPrompt } from './catalog';
import { parseAgentScore, type AgentScoreReport } from './agentScore';
import { composeStyled, specFor, type StyleMood } from './styles';
import { seedFor } from './arrange';
import { randomTitle } from './titles';
import { THEORY_PRIMER, conformScore, harmonyPlan, inferPlan, planText, scoreToText, type HarmonyPlan } from './theory';
import { REWRITE_BELOW, critiqueScore, finishScore, rewriteRequest } from './critic';
import { instrumentsOf, styleFromText, styleLabel } from './simple';
import type { MusicScore } from './types';
import logger from '../utils/logger';
import { melodySystemPrompt, parseMelody, scoreFromMelody } from './melodyFallback';

/** Not an entry in the agent store on purpose: nothing lists it, edits it or chats with it. */
export const COMPOSER_AGENT = { id: '__atlas-composer__', hidden: true, name: 'Atlas composer' } as const;

/** A much shorter instruction for the second try: a small model or a small context window loses the long one (the theory and the full instrument list). */
function compactSystemPrompt(): string {
  return `You write instrumental music as a score. Reply with score lines only, one per line, nothing else:
TITLE: a short title
BPM: 60 to 165
NOTE <pitch like C4 or F#3> <start beat> <length in beats> <loudness 0.05-1> <instrument id>
DRUM <kick|snare|hat|clap> <start beat> <loudness>
Instruments: ${INSTRUMENTS.slice(0, 40).map((i) => i.id).join(', ')}.
Beats count from 0; a bar is 4 beats. Use the key and chords you are given. Write a bass line, chords and a melody, and drums if the style needs them.
Example:
TITLE: Window Rain
BPM: 84
NOTE C3 0 4 0.45 upright
NOTE C4 0 4 0.25 warmpad
NOTE E5 0 1.5 0.55 flute
DRUM hat 0 0.4`;
}

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

${THEORY_PRIMER}

HOW TO WRITE IT
- The request gives you the KEY, the scale and the chord of every bar: use them exactly. (With no plan, pick a key and stay in it, with a chord progression of 4 chords repeating.)
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

/** "D Dorian" for the note. */
const harmonyLabel = (plan: HarmonyPlan): string => planText(plan).split('.')[0].replace('KEY: ', '');

export interface ComposeOptions { seconds?: number; /** Instrument ids the person chose; the composer uses these (and drums only if the style needs them). */ instruments?: string[]; /** Replaces the model call (tests, and callers that already hold a model). */ ask?: (system: string, user: string) => Promise<string>; style?: StyleMood }
export interface Composed { score: MusicScore; via: 'composer' | 'built-in'; instruments: string; style: StyleMood; note: string }

const clampSeconds = (s: number | undefined) => Math.max(20, Math.min(120, Math.round(s ?? 60)));

/** The instruments sentence of the brief: the person's choice when there is one, else what suits the style. */
function instrumentLine(style: StyleMood, chosen: string[]): string {
  const labels = chosen.map((id) => instrumentById(id)?.label).filter((l): l is string => !!l);
  if (labels.length) return `The person chose these instruments: ${labels.join(', ')}. Use all of them and no other pitched instrument; drums only if the style needs a beat.`;
  return `Instruments that suit it: ${instrumentsOf(style)}, and any others from the list that fit.`;
}

/** What the agent is told about this request: the wanted style and mood in words, a tempo, a length in bars, and the instruments that suit it. */
export function composerBrief(request: string, style: StyleMood, length: number | { seconds: number; instruments?: string[] }): { text: string; bars: number; bpm: number; plan: HarmonyPlan } {
  const seconds = typeof length === 'number' ? length : length.seconds;
  const chosen = { instruments: typeof length === 'number' ? [] : length.instruments };
  const spec = specFor(style);
  const bars = Math.max(8, Math.min(32, Math.round((Math.min(seconds, 90) * spec.bpm) / 60 / spec.beatsPerBar)));
  // The key, the scale and a chord for every bar are worked out here, so the model writes notes that fit instead of guessing a key.
  const plan = harmonyPlan(spec, bars, seedFor(request, style));
  const text = `Request: ${request.trim().slice(0, 300) || 'background music'}\nStyle: ${styleLabel(style)}. Tempo about ${spec.bpm} BPM. ${instrumentLine(style, chosen.instruments ?? [])}\n${planText(plan)}\nWrite exactly ${bars} bars (${bars * spec.beatsPerBar} beats). Reply with the score lines only.`;
  return { text, bars, bpm: spec.bpm, plan };
}

async function askModelDefault(system: string, user: string): Promise<string> {
  const { askModel } = require('../study/engine');
  return askModel(system, user);
}

/** What the composer is told for a variation: the plan the original follows, the original itself, and what to change and keep. */
function variationBrief(original: MusicScore, plan: HarmonyPlan): string {
  const bars = plan.bars.length;
  return `Request: a variation of the tune below.\n${planText(plan)}\nTHE ORIGINAL (${bars} bars, ${Math.round(original.bpm)} BPM):\n${scoreToText(original)}\n\nWrite a VARIATION: keep the key, the chords, the tempo and exactly ${bars} bars, and keep a similar band. Write a new melody that is clearly related to the original (reuse its opening idea, changed), change the rhythm of the bass and the drums a little, and let a different instrument carry the tune in the second half. Reply with the score lines only.`;
}

const NAMER_SYSTEM = `You give instrumental tunes their names. Reply with ONLY the title: 2 to 5 words, no quotes, no full stop, no explanation. A title is evocative (a place, a mood, an image), like "Window Rain" or "Night Train Home". Never use the words music, tune, song, instrumental or track.`;

/** What the model said, cleaned into a title (2 to 6 words, no quotes or labels), or '' when it is not a usable title. */
export function cleanTitle(raw: string): string {
  const line = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const text = line.replace(/^(title|name)\s*[:\-]\s*/i, '').replace(/^["'“”‘’*_`#\s]+|["'“”‘’*_`.!\s]+$/g, '').replace(/\s+/g, ' ');
  const words = text.split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 6 || text.length > 50 || /\b(music|tune|song|instrumental|track)\b/i.test(text)) return '';
  return text;
}

/** Asks the model for a name for a finished tune (one short reply). Returns the title, or '' to keep the one the tune has. */
async function nameTune(o: { request: string; style: StyleMood; plan: HarmonyPlan; bpm: number; instruments: string }, ask: (system: string, user: string) => Promise<string>): Promise<string> {
  try {
    const about = `Style: ${styleLabel(o.style)}. ${harmonyLabel(o.plan)}, about ${Math.round(o.bpm)} beats per minute. Played by ${o.instruments}.${o.request.trim() ? ` The request was: "${o.request.trim().slice(0, 160)}".` : ''}`;
    return cleanTitle(await ask(NAMER_SYSTEM, `${about}\nGive it a title.`));
  } catch { return ''; }
}

/** True for the placeholder a tune gets when the composer wrote no title of its own. */
const isPlaceholderTitle = (title: string): boolean => !title.trim() || /^original instrumental$/i.test(title.trim());

interface Written { score: MusicScore; instruments: string; note: string }

/**
 * The composer's whole pass for one brief: ask (twice if the first score is unusable), put the notes in key, listen to the result and
 * send a weak tune back once, then end it on the home note with fades. Throws the last problem when no usable score came back.
 */
async function writeScore(brief: { text: string; plan: HarmonyPlan }, ask: (system: string, user: string) => Promise<string>, finish: { fadeIn?: boolean } = {}): Promise<Written> {
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw = '';
    try {
      raw = await ask(attempt ? compactSystemPrompt() : composerSystemPrompt(), attempt ? `${brief.text}\n\nYour last score could not be used (${/enough playable notes/.test(problem) ? 'too few readable NOTE lines' : 'a problem with its lines'}). Write it again using only TITLE, BPM, NOTE and DRUM lines, one per line, with no other words.` : brief.text);
      const minNotes = Math.min(12, Math.max(6, brief.plan.bars.length * 2)); // a short tune needs fewer notes
      let report: AgentScoreReport = parseAgentScore(raw, minNotes);
      // What the model wrote is held to the plan: out-of-key notes, off-beat timings and a bass that misses the chord root are put right.
      let fixed = conformScore(report.score, brief.plan);
      report.score = fixed.score;
      let critique = critiqueScore(report.score, brief.plan);
      let rewrote = false;
      // A weak tune goes back once with the list of what is wrong; the better of the two is kept.
      if (critique.score < REWRITE_BELOW && critique.issues.length) {
        try {
          const second = parseAgentScore(await ask(composerSystemPrompt(), rewriteRequest(brief.text, critique)), minNotes);
          const secondFixed = conformScore(second.score, brief.plan);
          const secondCritique = critiqueScore(secondFixed.score, brief.plan);
          if (secondCritique.score > critique.score) { report = { ...second, score: secondFixed.score }; fixed = secondFixed; critique = secondCritique; rewrote = true; }
        } catch { /* keep the first tune */ }
      }
      report.score = finishScore(report.score, brief.plan, finish);
      const instruments = [...report.instruments, ...report.drums.map((d) => `${d} drum`)].join(', ');
      const total = Object.values(fixed.changed).reduce((a, b) => a + b, 0);
      return { score: report.score, instruments, note: `Written by the composer with ${instruments}, in ${harmonyLabel(brief.plan)}${total ? `; ${total} note${total === 1 ? '' : 's'} adjusted to fit the key and chords` : ''}${rewrote ? '; rewritten once after a listening check' : ''}. Quality check: ${critique.score}/100.` };
    } catch (e: any) {
      problem = String(e?.message || e);
      logger.warn(`[MUSIC] composer attempt ${attempt + 1} unusable: ${problem}; reply began: ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
      if (/no model|could not be loaded|failed to load/i.test(problem)) break; // no point asking again
    }
  }
  throw new Error(problem);
}

/**
 * The composer's last try: only the melody (melodyFallback.ts), with the bass and chords made from the plan. Returns null when the model's
 * reply has too few notes, so the built-in composer takes over. The title is the AI's own, else a random one for the style.
 */
async function writeMelodyOnly(brief: ReturnType<typeof composerBrief>, ctx: { request: string; style: StyleMood }, ask: (system: string, user: string) => Promise<string>): Promise<Composed | null> {
  let raw = '';
  try {
    raw = await ask(melodySystemPrompt(), `${brief.text}\n\nWrite only the melody, in the format given.`);
    const spec = specFor(ctx.style);
    const melody = parseMelody(raw);
    const made = scoreFromMelody(melody, brief.plan, { title: melody.title, bpm: melody.bpm ?? spec.bpm, band: spec.band });
    if (!made) throw new Error(`only ${melody.notes.filter((n) => n.pitch !== null).length} readable notes`);
    const conformed = conformScore(made, brief.plan);
    const finished = finishScore(conformed.score, brief.plan, {});
    const named = await nameTune({ request: ctx.request, style: ctx.style, plan: brief.plan, bpm: finished.bpm, instruments: instrumentsOf(ctx.style) }, ask);
    const title = named || cleanTitle(melody.title) || randomTitle(ctx.style, spec.group);
    return { score: { ...finished, title }, via: 'composer', instruments: instrumentsOf(ctx.style), style: ctx.style, note: `The composer's full score could not be read, so it wrote the melody only (${melody.notes.filter((n) => n.pitch !== null).length} notes) and the app added the bass and chords in ${harmonyLabel(brief.plan)}.` };
  } catch (e: any) {
    logger.warn(`[MUSIC] melody-only try unusable: ${String(e?.message || e)}; reply began: ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
    return null;
  }
}

/** Writes a tune for a request: the composer agent first, then its melody alone, then the built-in composer when neither works. */
export async function composeMusic(request: string, options: ComposeOptions = {}): Promise<Composed> {
  return withScreenOn(() => composeMusicNow(request, options));
}

/** The screen stays on while the AI writes the tune (it can take minutes on a slow phone). */
let musicJobs = 0;
async function withScreenOn<T>(work: () => Promise<T>): Promise<T> {
  const reason = `music-writing-${++musicJobs}`; // one reason per call: a second tune finishing never lets go of the first one's hold
  let power: { holdScreenAwake: (r: string) => void; releaseScreenAwake: (r: string) => void } | null = null;
  try { power = require('../atlasTools/runtimePower'); power?.holdScreenAwake(reason); } catch { power = null; }
  try { return await work(); } finally { power?.releaseScreenAwake(reason); }
}

/** Below this writing speed (tokens a second) a whole score takes minutes per try, so the composer writes only the melody. */
const SLOW_WRITER_TPS = 8;
/** The measured writing speed of the model in use, or 0 when none is known. */
function writingSpeed(): number {
  try {
    const id = require('../stores').useAppStore.getState().activeModelId;
    return id ? Number(require('../atlasTools/speed').useSpeedStats.getState().byModel[id]?.decode) || 0 : 0;
  } catch { return 0; }
}

/** Times each question to the model, so the log says where the minutes went. */
function timed(ask: (system: string, user: string) => Promise<string>): (system: string, user: string) => Promise<string> {
  return async (system, user) => {
    const at = Date.now();
    try {
      const reply = await ask(system, user);
      logger.log(`[MUSIC] the model answered in ${((Date.now() - at) / 1000).toFixed(0)} s: ${reply.length} characters for a prompt of ${system.length + user.length}`);
      return reply;
    } catch (e) { logger.warn(`[MUSIC] the model failed after ${((Date.now() - at) / 1000).toFixed(0)} s: ${String((e as Error)?.message || e).slice(0, 200)}`); throw e; }
  };
}

async function composeMusicNow(request: string, options: ComposeOptions): Promise<Composed> {
  const seconds = clampSeconds(options.seconds);
  const style = options.style ?? styleFromText(request) ?? 'focus';
  const brief = composerBrief(request, style, { seconds, instruments: options.instruments });
  const ask = timed(options.ask ?? askModelDefault);
  // A slow writer (a big model on this phone) needs minutes for a whole score, and up to four questions: it is asked for the melody alone,
  // one short question, and the app builds the rest. The built-in composer takes over if that cannot be read.
  const speed = writingSpeed();
  if (speed > 0 && speed < SLOW_WRITER_TPS) {
    logger.log(`[MUSIC] this model writes about ${speed.toFixed(1)} tokens a second: asking for the melody only`);
    const melodyFirst = await writeMelodyOnly(brief, { request, style }, ask);
    if (melodyFirst) return { ...melodyFirst, note: `${melodyFirst.note} This model writes about ${speed.toFixed(1)} tokens a second, so the composer was asked for the melody only: a whole score would take several minutes.` };
    const named = await nameTune({ request, style, plan: brief.plan, bpm: specFor(style).bpm, instruments: instrumentsOf(style) }, ask);
    const built = { ...composeStyled(request, style), title: `${named || randomTitle(style, specFor(style).group)} (${specFor(style).label})` };
    return { score: built, via: 'built-in', instruments: instrumentsOf(style), style, note: `The composer could not write a melody this model could be read from, so the built-in ${styleLabel(style)} composer made this tune with ${instrumentsOf(style)}.` };
  }
  try {
    const written = await writeScore(brief, ask);
    // The AI names what it made: a short second question once the tune is written (the title it wrote on its own is the fallback).
    const named = await nameTune({ request, style, plan: brief.plan, bpm: written.score.bpm, instruments: written.instruments }, ask);
    const score = named ? { ...written.score, title: named } : isPlaceholderTitle(written.score.title) ? { ...written.score, title: randomTitle(style, specFor(style).group) } : written.score;
    return { score, via: 'composer', instruments: written.instruments, style, note: written.note };
  } catch (e: any) {
    // Nothing more is asked when there is no model, or when the model was stopped for being stuck or too slow: a second try would only repeat it.
    const noModel = /no model|could not be loaded|failed to load|took too long|was stopped|still (reading|writing)|stopped writing|out of memory/i.test(String(e?.message || e));
    const melodyOnly = noModel ? null : await writeMelodyOnly(brief, { request, style }, ask);
    if (melodyOnly) return melodyOnly;
    // Even here the tune gets a name of its own: the AI's, else a random one for the style (never the request text as a title).
    const named = noModel ? '' : await nameTune({ request, style, plan: brief.plan, bpm: specFor(style).bpm, instruments: instrumentsOf(style) }, ask);
    const built = { ...composeStyled(request, style), title: `${named || randomTitle(style, specFor(style).group)} (${specFor(style).label})` };
    return { score: built, via: 'built-in', instruments: instrumentsOf(style), style, note: `The composer could not write a usable score (${String(e?.message || e)}), so the built-in ${styleLabel(style)} composer made this tune with ${instrumentsOf(style)}.` };
  }
}

/**
 * A variation of a saved tune: the same key, scale, chords, tempo and length, with a new melody and a changed feel. The key and chords are
 * read back from the notes (theory.ts `inferPlan`), the composer is shown the original and asked for a related new tune, and the answer goes
 * through the same checks as any other. When the composer cannot, the built-in composer makes the next variant of the same style.
 */
export async function composeVariation(original: MusicScore, options: ComposeOptions & { mood?: StyleMood; variant?: number } = {}): Promise<Composed> {
  return withScreenOn(() => composeVariationNow(original, options));
}

async function composeVariationNow(original: MusicScore, options: ComposeOptions & { mood?: StyleMood; variant?: number }): Promise<Composed> {
  const style = options.mood ?? options.style ?? 'focus';
  const plan = inferPlan(original, 4);
  const fallback = (why: string): Composed => ({ score: composeStyled(original.title, style, { variant: (options.variant ?? 0) + 1 }), via: 'built-in', instruments: instrumentsOf(style), style, note: `The composer could not write a variation (${why}), so the built-in ${styleLabel(style)} composer made the next variant.` });
  if (!plan) return fallback('the key of this tune could not be read from its notes');
  const text = variationBrief(original, plan);
  try {
    const written = await writeScore({ text, plan }, options.ask ?? askModelDefault);
    return { score: { ...written.score, title: `${original.title} (variation)` }, via: 'composer', instruments: written.instruments, style, note: `Variation of "${original.title}". ${written.note}` };
  } catch (e: any) { return fallback(String(e?.message || e)); }
}

/** The longest a track can be, in beats (the editor's limit): an extension stops there. */
const MAX_TRACK_BEATS = 128;

/**
 * Continues a saved tune with a new, contrasting section (a B part) in the same key, tempo and chords, and returns the tune followed by
 * that section. Needs room: a tune may not pass 32 bars, so a 24-bar tune is extended by up to 8 bars. Unlike a variation there is no
 * built-in fallback (nothing the built-in composer makes would continue THIS tune), so a failure is reported.
 */
export async function composeContinuation(original: MusicScore, options: ComposeOptions & { mood?: StyleMood } = {}): Promise<Composed> {
  const style = options.mood ?? options.style ?? 'focus';
  const plan = inferPlan(original, 4);
  if (!plan) throw new Error('The key of this tune could not be read from its notes.');
  const origBeats = plan.bars.length * plan.beatsPerBar;
  const extra = Math.min(plan.bars.length, Math.floor((MAX_TRACK_BEATS - origBeats) / plan.beatsPerBar));
  if (extra < 4) throw new Error('This tune is already as long as a track can be (32 bars). Make a variation instead.');
  const section: HarmonyPlan = { ...plan, bars: plan.bars.slice(0, extra) };
  const text = continuationBrief(original, plan, extra);
  // No fade-in for the new section: it joins a tune that is already playing.
  const written = await writeScore({ text, plan: section }, options.ask ?? askModelDefault, { fadeIn: false });
  // Keep only what falls inside the asked-for bars (a model that writes more would push the tune past the track limit).
  const sectionBeats = extra * plan.beatsPerBar;
  const added = written.score.notes.filter((n) => n.beat < sectionBeats).map((n) => ({ ...n, beat: n.beat + origBeats, length: Math.min(n.length, sectionBeats - n.beat) }));
  const score: MusicScore = { ...original, title: `${original.title} (extended)`, notes: [...original.notes, ...added] };
  return { score, via: 'composer', instruments: written.instruments, style, note: `Extended "${original.title}" by ${extra} bars. ${written.note}` };
}

/** What the composer is told to continue a tune: the plan, the original, and a contrasting section of the stated length. */
function continuationBrief(original: MusicScore, plan: HarmonyPlan, bars: number): string {
  return `Request: continue the tune below with its next section.\n${planText(plan)}\nTHE ORIGINAL (${plan.bars.length} bars, ${Math.round(original.bpm)} BPM):\n${scoreToText(original)}\n\nWrite ONLY the next section: exactly ${bars} bars, counted from beat 0 (the music that comes after the original), in the same key, tempo and chords as the first ${bars} bars above. Make it a CONTRAST (a B part): a new melody that is related but not a copy, a different rhythm, and one instrument added or swapped. Reply with the score lines only.`;
}

/** What the make_music tool does: compose, render, save to the music library and start playing. Returns the words the chat model gives back. @public */
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
