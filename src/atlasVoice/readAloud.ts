import { NativeEventEmitter, NativeModules } from 'react-native';
import { create } from 'zustand';
import { speakInAndWait, stop as stopSpeech, takeSpeechFailure, watchSpeechPhase } from './tts';
import { useAtlasVoiceStore } from './store';
import { useVoiceProfiles } from './profiles';
import { loadVoiceForSpeech, restoreSavedVoice, restoreSavedVoiceSoon } from './neural';
import { readResumeBridge } from './readResume';

/** Longest piece spoken at once: short enough to show progress and to pause, long enough to sound natural. */
const MAX_PART = 600;
/** About how many words a voice speaks per minute at normal speed. */
const WORDS_PER_MINUTE = 160;

/** Plain text for the voice: markdown marks, code blocks, images and web addresses are dropped. */
export function cleanForReading(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cuts one over-long sentence at spaces so every piece fits. */
function cutLong(sentence: string): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_PART) {
    const at = rest.lastIndexOf(' ', MAX_PART);
    const cut = at > MAX_PART / 2 ? at : MAX_PART;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Groups whole sentences into pieces of at most MAX_PART characters, starting a new piece at each paragraph. */
export function splitForReading(text: string): string[] {
  const parts: string[] = [];
  for (const paragraph of text.split(/\n\s*\n|\n/)) {
    let current = '';
    // No regex lookbehind: older Hermes builds lack it.
    const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [];
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      for (const piece of cutLong(sentence)) {
        if (current && current.length + piece.length + 1 > MAX_PART) { parts.push(current); current = ''; }
        current = current ? `${current} ${piece}` : piece;
      }
    }
    if (current) parts.push(current);
  }
  return parts.filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/** Minutes to read this many words at a speed (1 = normal), rounded up and never below one. */
export function readingMinutes(words: number, rate: number): number {
  return Math.max(1, Math.ceil(words / (WORDS_PER_MINUTE * Math.max(0.25, rate))));
}

import type { ReaderStatus } from './readerStatus';
/**
 * What is really happening, from the voice engine's own reports: loading (the voice and its recording are being made ready),
 * generating (the first sound is being made), speaking, buffering (the next piece is still being made), paused, failed.
 */
export type ReaderPhase = 'idle' | 'loading' | 'generating' | 'speaking' | 'buffering' | 'paused' | 'failed';
interface ReaderState {
  status: ReaderStatus; title: string; parts: string[]; index: number;
  phase: ReaderPhase;
  /** Why reading stopped by itself, when it did ('' otherwise). */
  failure: string;
  /** The part reading picked up at from an earlier session of the same text (0 when it started from the top). */
  resumedAt: number;
  /** When the sleep timer will pause reading (epoch ms), or 0 when it is off. */
  sleepAt: number;
  /** True from pressing play until the voice is actually heard: a cloned voice has to load first and that can take several seconds. */
  preparing: boolean;
}
/** What a piece being spoken can tell the reader: whether the person has already stopped it, and which stage it has reached. */
interface SpeakControl { cancelled: () => boolean; phase: (p: 'loading' | 'generating') => void }
interface Deps {
  speak: (text: string, control: SpeakControl) => Promise<boolean>;
  stopSpeaking: () => void;
  /** Called when reading ends or is stopped, so a borrowed voice can be given back. */
  release?: () => void;
  /** Calls back when sound starts. Returns a function that stops listening. */
  watchStart?: (onStart: () => void) => () => void;
  /** Calls back when the engine reports speaking or buffering. */
  watchPhase?: (onPhase: (p: 'speaking' | 'buffering') => void) => () => void;
  /** Why the last piece failed, if it did (reading it clears it). */
  failure?: () => string;
  /** Remembers how far a text was read, so opening it again carries on from there. */
  resume?: { get: (key: string) => number; set: (key: string, index: number) => void; clear: (key: string) => void };
  /** The clock, for the sleep timer. */
  now?: () => number;
}

/** A short key for a text: its length and a hash of its start and end, so the same document is recognised when it is opened again. */
function textKey(text: string): string {
  const sample = `${text.slice(0, 2000)}${text.slice(-2000)}`;
  let h = 2166136261;
  for (let i = 0; i < sample.length; i++) { h ^= sample.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${text.length}-${(h >>> 0).toString(36)}`;
}

/**
 * Reads a document aloud one piece at a time, with pause, stop and skip. The voice, speed and engine are the
 * app's saved ones. The reader owns all of its state; screens and widgets only show it and send intents.
 */
export function createReadAloud({ speak, stopSpeaking, release, watchStart, watchPhase, failure, resume, now = Date.now }: Deps) {
  const useReader = create<ReaderState>(() => ({ status: 'idle', title: '', parts: [], index: 0, preparing: false, phase: 'idle', failure: '', resumedAt: 0, sleepAt: 0 }));
  let run = 0;
  let key = '';
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  let sleepDue = false;
  const remember = (index: number) => { if (key && index > 0) resume?.set(key, index); };
  const show = (phase: ReaderPhase, extra: Partial<ReaderState> = {}) =>
    useReader.setState({ phase, preparing: phase === 'loading' || phase === 'generating', ...extra });
  watchStart?.(() => { if (useReader.getState().status === 'reading') show('speaking'); });
  watchPhase?.((p) => { if (useReader.getState().status === 'reading') show(p); });

  const loop = async (mine: number) => {
    const control: SpeakControl = { cancelled: () => mine !== run, phase: (p) => { if (mine === run) show(p); } };
    while (mine === run) {
      const { parts, index } = useReader.getState();
      if (index >= parts.length) { if (key) resume?.clear(key); show('idle', { status: 'idle', index: 0, resumedAt: 0 }); release?.(); return; }
      show('loading', { failure: '' });
      let finished = false;
      let problem = '';
      try { finished = await speak(parts[index], control); } catch (e) { problem = (e as Error)?.message || 'The voice failed'; }
      if (mine !== run) return;
      problem = problem || failure?.() || '';
      // The voice failed: say why and keep the place, instead of looking as if it is still reading.
      if (problem) { show('failed', { status: 'paused', failure: problem }); return; }
      // Something else started speaking (a chat reply or a call): keep our place and wait for the person.
      if (!finished) { show('paused', { status: 'paused' }); return; }
      useReader.setState({ index: index + 1, resumedAt: 0 });
      remember(index + 1);
      // The sleep timer ran out while this part was being read: stop at the end of it, keeping the place.
      if (sleepDue) { sleepDue = false; useReader.setState({ sleepAt: 0 }); show('paused', { status: 'paused' }); return; }
    }
  };

  const play = () => {
    const { parts, status } = useReader.getState();
    if (!parts.length || status === 'reading') return;
    useReader.setState({ status: 'reading' });
    run += 1;
    loop(run);
  };
  const setSleep = (minutes: number) => {
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepDue = false;
    if (!Number.isFinite(minutes) || minutes <= 0) { useReader.setState({ sleepAt: 0 }); return; }
    useReader.setState({ sleepAt: now() + minutes * 60000 });
    sleepTimer = setTimeout(() => { sleepDue = true; }, minutes * 60000);
  };
  const stop = () => {
    run += 1;
    stopSpeaking();
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepDue = false;
    if (key) resume?.clear(key);
    show('idle', { status: 'idle', index: 0, failure: '', resumedAt: 0, sleepAt: 0 });
    release?.();
  };
  const pause = () => {
    if (useReader.getState().status !== 'reading') return;
    run += 1;
    stopSpeaking();
    show('paused', { status: 'paused' });
  };
  /** Opens new text, replacing whatever was loaded. Reading starts only when the person presses play. */
  const load = (text: string, title = '') => {
    stop();
    const parts = splitForReading(cleanForReading(text));
    key = textKey(text);
    const saved = resume?.get(key) ?? 0;
    const at = saved > 0 && saved < parts.length ? saved : 0;
    useReader.setState({ parts, title, index: at, resumedAt: at });
  };
  /** Moves by whole pieces. While reading, carries on from the new place. */
  const jump = (delta: number) => {
    const { parts, index, status } = useReader.getState();
    if (!parts.length) return;
    const next = Math.min(parts.length - 1, Math.max(0, index + delta));
    if (status === 'reading') { run += 1; stopSpeaking(); }
    show('paused', { index: next, status: status === 'reading' ? 'paused' : status, failure: '', resumedAt: 0 });
    remember(next);
    if (status === 'reading') play();
  };

  return { useReader, play, pause, stop, load, jump, setSleep };
}

/** The voice profile Read aloud uses: the one chosen if it still exists, otherwise the first saved voice, otherwise none. */
export function readVoiceProfile(): { id: string; name: string; voiceId: string; sid: number; referenceId?: string; steps?: number } | undefined {
  const { profiles } = useVoiceProfiles.getState();
  const chosen = useAtlasVoiceStore.getState().readVoiceId;
  return profiles.find((p) => p.id === chosen) ?? profiles[0];
}

/**
 * Reads one piece in the voice chosen for Read aloud, borrowing a saved voice profile (even a cloned one) when one is chosen.
 * The chosen voice and its recording must be active before any text is handed to the engine; if they cannot be, it says so
 * instead of reading in some other voice.
 */
/** Makes the voice chosen for Read aloud (and its recording) the active one. Throws a readable error when it cannot be. */
export async function prepareReadVoice(): Promise<void> {
  const profile = readVoiceProfile();
  if (profile) {
    try { await loadVoiceForSpeech(profile.voiceId, profile.sid, { referenceId: profile.referenceId, steps: profile.steps }); }
    catch (e) { throw new Error(`The voice could not be loaded: ${(e as Error)?.message || 'unknown error'}`); }
  } else {
    // Without a chosen profile this puts the saved voice back, in case a briefing left a borrowed one loaded. It costs nothing when it is already loaded.
    await restoreSavedVoice().catch(() => undefined);
  }
}

async function speakInChosenVoice(text: string, control: SpeakControl): Promise<boolean> {
  control.phase('loading');
  await prepareReadVoice();
  // Stopped or skipped while the voice was loading: say nothing, rather than starting a reading the person has already cancelled.
  if (control.cancelled()) return false;
  control.phase('generating');
  // An empty language means the phone's own default, the same as the speak button in chat.
  return speakInAndWait(text, '', { messageId: 'read-aloud' });
}

export const readAloud = createReadAloud({
  speak: speakInChosenVoice,
  stopSpeaking: stopSpeech,
  release: () => { if (readVoiceProfile()) restoreSavedVoiceSoon(); },
  watchPhase: (onPhase) => watchSpeechPhase((phase, id) => { if (id.startsWith('read-aloud')) onPhase(phase); }),
  failure: takeSpeechFailure,
  resume: readResumeBridge,
});
export const useReadAloud = readAloud.useReader;

/** Lock-screen controls, where the phone has them (Android): the notification follows the reader and its buttons drive it. */
function connectMediaControls(): void {
  const native = NativeModules.AtlasMediaControls;
  if (!native?.show) return; // the phone has the controls when its native module is there
  const { startMediaControls } = require('./mediaControls');
  const controls = startMediaControls({ getState: readAloud.useReader.getState, subscribe: readAloud.useReader.subscribe, play: readAloud.play, pause: readAloud.pause, stop: readAloud.stop, jump: readAloud.jump }, native);
  new NativeEventEmitter(native).addListener('AtlasMediaAction', (e: { action: string }) => controls.press(e.action as never));
}
connectMediaControls();
