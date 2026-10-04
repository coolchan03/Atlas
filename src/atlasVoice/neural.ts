import { NativeEventEmitter, NativeModules } from 'react-native';
import { create } from 'zustand';
import { useAtlasVoiceStore } from './store';

/**
 * Natural offline voices: neural text-to-speech models downloaded once (from this app's
 * "atlas-voices" release) and run on the phone. Much more human than the phone's built-in voice.
 */
const Native: any = NativeModules.AtlasTts;
const BASE = 'https://github.com/coolchan03/Off-Grid/releases/download/atlas-voices/';

export interface NeuralVoice { id: string; name: string; desc: string; size: string; speakers?: { sid: number; name: string; female: boolean; accent: string }[] }

export const KOKORO_SPEAKERS = [
  { sid: 0, name: 'Heart (default)', female: true, accent: 'US' },
  { sid: 1, name: 'Bella', female: true, accent: 'US' },
  { sid: 2, name: 'Nicole', female: true, accent: 'US' },
  { sid: 3, name: 'Sarah', female: true, accent: 'US' },
  { sid: 4, name: 'Sky', female: true, accent: 'US' },
  { sid: 5, name: 'Adam', female: false, accent: 'US' },
  { sid: 6, name: 'Michael', female: false, accent: 'US' },
  { sid: 7, name: 'Emma', female: true, accent: 'UK' },
  { sid: 8, name: 'Isabella', female: true, accent: 'UK' },
  { sid: 9, name: 'George', female: false, accent: 'UK' },
  { sid: 10, name: 'Lewis', female: false, accent: 'UK' },
];

export const NEURAL_VOICES: NeuralVoice[] = [
  { id: 'kokoro-en', name: 'Kokoro (best)', desc: 'Very natural. 11 voices (US and UK, men and women) - podcasts can use several. Needs a fast phone.', size: '~140 MB', speakers: KOKORO_SPEAKERS },
  { id: 'piper-amy', name: 'Amy (Piper)', desc: 'Clear US woman. Fast on any phone.', size: '~65 MB' },
  { id: 'piper-ryan', name: 'Ryan (Piper)', desc: 'US man. Fast on any phone.', size: '~65 MB' },
  { id: 'piper-lessac', name: 'Lessac (Piper)', desc: 'Calm US woman, good for long reading.', size: '~65 MB' },
  { id: 'piper-joe', name: 'Joe (Piper)', desc: 'US man, relaxed.', size: '~65 MB' },
  { id: 'piper-hfc', name: 'HFC (Piper)', desc: 'Bright US woman.', size: '~65 MB' },
];

interface DlState { progress: Record<string, number>; installed: Record<string, number>; set: (p: Partial<DlState>) => void }
export const useNeuralVoices = create<DlState>((set) => ({ progress: {}, installed: {}, set: (p) => set(p) }));

let listening = false;
function listen() {
  if (listening || !Native) return;
  listening = true;
  new NativeEventEmitter(Native).addListener('AtlasVoiceDownload', (e: { id: string; progress: number }) => {
    const s = useNeuralVoices.getState();
    s.set({ progress: { ...s.progress, [e.id]: e.progress } });
  });
}

export const neuralAvailable = () => !!Native?.setNeuralVoice;

export async function refreshInstalled(): Promise<void> {
  if (!neuralAvailable()) return;
  const list: { id: string; bytes: number }[] = await Native.installedNeuralVoices();
  const installed: Record<string, number> = {};
  list.forEach((v) => { installed[v.id] = v.bytes; });
  useNeuralVoices.getState().set({ installed });
}

export async function downloadVoice(id: string): Promise<void> {
  listen();
  const s = useNeuralVoices.getState();
  s.set({ progress: { ...s.progress, [id]: 0 } });
  try {
    await Native.downloadNeuralVoice(id, `${BASE}${id}.zip`);
    await refreshInstalled();
  } finally {
    const p = { ...useNeuralVoices.getState().progress }; delete p[id];
    useNeuralVoices.getState().set({ progress: p });
  }
}

export const cancelVoiceDownload = (id: string) => Native?.cancelNeuralDownload?.(id);

export async function deleteVoice(id: string): Promise<void> {
  if (useAtlasVoiceStore.getState().neuralVoice === id) await selectVoice('');
  await Native.deleteNeuralVoice(id);
  await refreshInstalled();
}

/** Switch the reading voice ('' = phone's own voice). Resolves the number of speakers in the model. */
export async function selectVoice(id: string, sid?: number): Promise<number> {
  const st = useAtlasVoiceStore.getState();
  const s = sid ?? (id === st.neuralVoice ? st.neuralSid : 0);
  const n: number = neuralAvailable() ? await Native.setNeuralVoice(id, s) : 0;
  st.setNeural(id, s);
  return n;
}

/** Called at start-up: re-load the chosen natural voice (falls back to the phone voice if it is gone). */
export async function restoreVoice(): Promise<void> {
  const st = useAtlasVoiceStore.getState();
  if (!st.neuralVoice || !neuralAvailable()) return;
  try { await Native.setNeuralVoice(st.neuralVoice, st.neuralSid); } catch { st.setNeural(''); }
}

/** Voices for podcast hosts: distinct-sounding speakers when the model has many. */
export function hostVoices(available: { name: string }[]): string[] {
  const st = useAtlasVoiceStore.getState();
  if (st.neuralVoice === 'kokoro-en' && available.length >= 11) {
    const main = KOKORO_SPEAKERS[st.neuralSid] || KOKORO_SPEAKERS[0];
    const other = KOKORO_SPEAKERS.find((k) => k.female !== main.female && k.accent === main.accent) || KOKORO_SPEAKERS[6];
    const third = KOKORO_SPEAKERS.find((k) => k.accent !== main.accent && k.sid !== main.sid) || KOKORO_SPEAKERS[7];
    return [`sid:${main.sid}`, `sid:${other.sid}`, `sid:${third.sid}`];
  }
  return available.slice(0, 3).map((v) => v.name);
}
