/**
 * Connects the station (station.ts) to the phone: the model that writes, the recording and the player, the voice and the clock. The one
 * place the radio touches the rest of the app. Start and stop are the only two things a screen asks for.
 */
import { askShaped } from '../study/engine';
import { instrumentalPlayer } from '../music/backgroundPlayer';
import { deleteInstrumentalTrack, useMusicLibrary, type InstrumentalTrack } from '../music/library';
import { useMusicPlayback } from '../music/backgroundPlayer';
import { saveInstrumental, scoreSeconds } from '../music/saveTrack';
import { speakAndWait, stop as stopVoice } from '../atlasVoice/tts';
import logger from '../utils/logger';
import { describeShow } from './dice';
import { isUnsuitable } from './poem';
import { runStation, type StationDeps, type StationEvent } from './station';
import { EMPTY_RUN, useRadioRun, useRadioSettings } from './store';

let stopRequested = false;
let skipRequested = false;
let wake: (() => void) | null = null;
let requested: string | null = null;
const kept = new Set<string>();
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let fading: ReturnType<typeof setInterval> | null = null;
let volumeBeforeFade: number | null = null;
let running: Promise<void> | null = null;

/** A wait the stop and skip buttons end at once. Resolves false when the station was stopped, true when it ran out or the song was skipped. */
const wait = (ms: number): Promise<boolean> => new Promise((resolve) => {
  if (stopRequested) { resolve(false); return; }
  if (skipRequested) { resolve(true); return; }
  const timer = setTimeout(() => { wake = null; resolve(!stopRequested); }, ms);
  wake = () => { clearTimeout(timer); wake = null; resolve(!stopRequested); };
});

function report(event: StationEvent): void {
  const set = useRadioRun.setState;
  if (event.kind === 'preparing') set({ line: `${event.what}...` });
  else if (event.kind === 'playing') set((s) => ({ line: 'Playing', title: event.title, about: describeShow(event.show), poem: event.poem, reading: false, kept: false, problem: null, songs: s.songs + 1 }));
  else if (event.kind === 'poem') set({ reading: true });
  else if (event.kind === 'problem') { logger.warn(`[RADIO] ${event.message}`); set({ problem: event.message }); }
  else set({ ...EMPTY_RUN });
}

const deps = (): StationDeps<InstrumentalTrack> => ({
  ask: async (system, user, options) => {
    try { return await askShaped(system, user, { label: 'Running the AI radio', maxTokens: options?.maxTokens ?? 200, grammar: options?.grammar }); }
    catch (e) { report({ kind: 'problem', message: `The AI could not answer, so the station plays tunes of its own choosing without poems: ${String((e as Error)?.message || e).slice(0, 160)}` }); throw e; }
  },
  makeTrack: (score) => saveInstrumental(score, { mood: 'ambient', seconds: scoreSeconds(score), by: 'AI radio' }),
  play: (track) => { skipRequested = false; return instrumentalPlayer.play(track); },
  discard: (track) => deleteInstrumentalTrack(track),
  speak: (text) => speakAndWait(text, { pitch: 1, messageId: 'radio' }),
  stopSpeaking: () => stopVoice(),
  stopMusic: () => instrumentalPlayer.stop(),
  wait,
  skipped: () => skipRequested,
  rng: Math.random,
  takeRequest: () => { const text = requested; requested = null; useRadioRun.setState({ request: null }); return text; },
  isKept: (track) => kept.has(track.id),
  report,
});

export function startRadio(): void {
  if (running) return;
  stopRequested = false; skipRequested = false; requested = null; kept.clear();
  const library = useMusicLibrary.getState();
  const hadLoop = library.loop;
  library.setLoop(true); // a song is one short pass that repeats until its time is up
  useRadioRun.setState({ ...EMPTY_RUN, on: true, line: 'Starting the station...' });
  const { set: _set, ...settings } = useRadioSettings.getState();
  running = runStation(settings, deps(), () => stopRequested).finally(() => { running = null; endSleep(); useMusicLibrary.getState().setLoop(hadLoop); });
}

export function stopRadio(): void {
  stopRequested = true;
  endSleep();
  wake?.();
  stopVoice();
  instrumentalPlayer.stop();
}

/** Moves on to the next song now. */
export function skipSong(): void {
  skipRequested = true;
  stopVoice();
  wake?.();
}

const MAX_REQUEST = 80;

/** Asks for the next song to be about this. Returns what happened, in words the screen can show; nothing is queued unless it is "ok". */
export function requestSong(text: string): 'ok' | 'empty' | 'unsuitable' {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_REQUEST);
  if (!clean) return 'empty';
  if (isUnsuitable(clean)) return 'unsuitable';
  requested = clean;
  useRadioRun.setState({ request: clean });
  return 'ok';
}

/** Keeps the song that is playing: it is not thrown away afterwards and stays in the Music Studio list. */
export function keepSong(): void {
  const id = useMusicPlayback.getState().current?.id;
  if (!id) return;
  kept.add(id);
  useRadioRun.setState({ kept: true });
}

/** Puts the station to sleep after that many minutes (null: not at all): the music fades out over 20 seconds and the station stops. */
const FADE_STEPS = 20;
const FADE_MS = FADE_STEPS * 1000;
export function setSleepTimer(minutes: number | null): void {
  endSleep();
  if (!minutes || minutes <= 0) return;
  const at = Date.now() + minutes * 60_000;
  useRadioRun.setState({ sleepAt: at });
  sleepTimer = setTimeout(startFade, Math.max(0, minutes * 60_000 - FADE_MS));
}

function startFade(): void {
  sleepTimer = null;
  const library = useMusicLibrary.getState();
  volumeBeforeFade = library.volume;
  let step = 0;
  fading = setInterval(() => {
    step += 1;
    useMusicLibrary.getState().setVolume((volumeBeforeFade ?? 0) * (1 - step / FADE_STEPS));
    if (step >= FADE_STEPS) { clearInterval(fading as ReturnType<typeof setInterval>); fading = null; stopRadio(); }
  }, FADE_MS / FADE_STEPS);
}

/** Cancels the timer and, when a fade was under way, puts the volume back. */
function endSleep(): void {
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
  if (fading) { clearInterval(fading); fading = null; }
  if (volumeBeforeFade !== null) { useMusicLibrary.getState().setVolume(volumeBeforeFade); volumeBeforeFade = null; }
  if (useRadioRun.getState().sleepAt !== null) useRadioRun.setState({ sleepAt: null });
}
