/**
 * Connects the station (station.ts) to the phone: the model that writes, the recording and the player, the voice and the clock. The one
 * place the radio touches the rest of the app. Start and stop are the only two things a screen asks for.
 */
import { askShaped } from '../study/engine';
import { instrumentalPlayer } from '../music/backgroundPlayer';
import { deleteInstrumentalTrack, useMusicLibrary, type InstrumentalTrack } from '../music/library';
import { saveInstrumental, scoreSeconds } from '../music/saveTrack';
import { speakAndWait, stop as stopVoice } from '../atlasVoice/tts';
import logger from '../utils/logger';
import { describeShow } from './dice';
import { runStation, type StationDeps, type StationEvent } from './station';
import { EMPTY_RUN, useRadioRun, useRadioSettings } from './store';

let stopRequested = false;
let skipRequested = false;
let wake: (() => void) | null = null;
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
  else if (event.kind === 'playing') set((s) => ({ line: 'Playing', title: event.title, about: describeShow(event.show), poem: event.poem, reading: false, problem: null, songs: s.songs + 1 }));
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
  report,
});

export function startRadio(): void {
  if (running) return;
  stopRequested = false; skipRequested = false;
  const library = useMusicLibrary.getState();
  const hadLoop = library.loop;
  library.setLoop(true); // a song is one short pass that repeats until its time is up
  useRadioRun.setState({ ...EMPTY_RUN, on: true, line: 'Starting the station...' });
  const { set: _set, ...settings } = useRadioSettings.getState();
  running = runStation(settings, deps(), () => stopRequested).finally(() => { running = null; useMusicLibrary.getState().setLoop(hadLoop); });
}

export function stopRadio(): void {
  stopRequested = true;
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
