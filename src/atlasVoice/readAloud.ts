import { create } from 'zustand';
import { speakInAndWait, stop as stopSpeech } from './tts';

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

export type ReaderStatus = 'idle' | 'reading' | 'paused';
interface ReaderState { status: ReaderStatus; title: string; parts: string[]; index: number }
interface Deps { speak: (text: string) => Promise<boolean>; stopSpeaking: () => void }

/**
 * Reads a document aloud one piece at a time, with pause, stop and skip. The voice, speed and engine are the
 * app's saved ones. The reader owns all of its state; screens and widgets only show it and send intents.
 */
export function createReadAloud({ speak, stopSpeaking }: Deps) {
  const useReader = create<ReaderState>(() => ({ status: 'idle', title: '', parts: [], index: 0 }));
  let run = 0;

  const loop = async (mine: number) => {
    while (mine === run) {
      const { parts, index } = useReader.getState();
      if (index >= parts.length) { useReader.setState({ status: 'idle', index: 0 }); return; }
      let finished = false;
      try { finished = await speak(parts[index]); } catch { finished = false; }
      if (mine !== run) return;
      // Something else started speaking (a chat reply or a call): keep our place and wait for the person.
      if (!finished) { useReader.setState({ status: 'paused' }); return; }
      useReader.setState({ index: index + 1 });
    }
  };

  const play = () => {
    const { parts, status } = useReader.getState();
    if (!parts.length || status === 'reading') return;
    useReader.setState({ status: 'reading' });
    run += 1;
    loop(run);
  };
  const stop = () => {
    run += 1;
    stopSpeaking();
    useReader.setState({ status: 'idle', index: 0 });
  };
  const pause = () => {
    if (useReader.getState().status !== 'reading') return;
    run += 1;
    stopSpeaking();
    useReader.setState({ status: 'paused' });
  };
  /** Opens new text, replacing whatever was loaded. Reading starts only when the person presses play. */
  const load = (text: string, title = '') => {
    stop();
    useReader.setState({ parts: splitForReading(cleanForReading(text)), title, index: 0 });
  };
  /** Moves by whole pieces. While reading, carries on from the new place. */
  const jump = (delta: number) => {
    const { parts, index, status } = useReader.getState();
    if (!parts.length) return;
    const next = Math.min(parts.length - 1, Math.max(0, index + delta));
    if (status === 'reading') { run += 1; stopSpeaking(); }
    useReader.setState({ index: next, status: status === 'reading' ? 'paused' : status });
    if (status === 'reading') play();
  };

  return { useReader, play, pause, stop, load, jump };
}

export const readAloud = createReadAloud({
  // An empty language means the phone's own default, the same as the speak button in chat.
  speak: (text) => speakInAndWait(text, '', { messageId: 'read-aloud' }),
  stopSpeaking: stopSpeech,
});
export const useReadAloud = readAloud.useReader;
