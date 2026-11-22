/**
 * Owns a live interpreting session: the microphone, the AI and the voice. The screen only shows `state()` and sends taps (start, stop,
 * type a line), so no interpreting logic lives in the view.
 *
 * One way: someone speaks language A, it is heard, translated into B, shown and spoken, and the microphone opens again.
 * Both ways: either of two people speaks; each turn is translated into the other language. With a multilingual Whisper model the language
 * of each turn is recognised by itself; with only the phone's recognizer it listens in A and B in turn, following whichever language the last
 * turn was translated into.
 */
import { speakInAndWait, stop as stopSpeech } from '../atlasVoice/tts';
import { hasMultilingualWhisper, listenInLanguage } from '../language/listenTurn';
import { SpeechCancelled } from '../services/systemSpeech';
import type { Listening } from '../language/listenTurn';
import { languageFor, type TranslatorLanguage } from './languages';
import { translateBothWays, translateText } from './translateService';

type Phase = 'idle' | 'listening' | 'transcribing' | 'translating' | 'speaking';

interface InterpretedLine { id: string; heard: string; said: string; toCode: string }
export interface InterpreterState {
  phase: Phase;
  running: boolean;
  /** Live words while someone talks (only the phone's recognizer has them). */
  partial: string;
  lines: InterpretedLine[];
  error: string | null;
  /** Nothing on this phone can listen: lines are typed instead. */
  typing: boolean;
}

export interface Interpreter {
  state: () => InterpreterState;
  subscribe: (fn: () => void) => () => void;
  start: () => void;
  stop: () => void;
  /** A line typed (when nothing can listen). */
  say: (text: string) => Promise<void>;
}

export interface InterpreterOptions { a: string; b: string; bothWays: boolean; speak: boolean }

export function createInterpreter(opts: InterpreterOptions): Interpreter {
  const A: TranslatorLanguage = languageFor(opts.a);
  const B: TranslatorLanguage = languageFor(opts.b);
  let st: InterpreterState = { phase: 'idle', running: false, partial: '', lines: [], error: null, typing: false };
  const listeners = new Set<() => void>();
  let run = 0;
  let listening: Listening | null = null;
  let seq = 0;
  const set = (p: Partial<InterpreterState>) => { st = { ...st, ...p }; listeners.forEach((l) => l()); };

  /** Translates what was said, shows it and (when asked) speaks it. Returns the language the translation went into. */
  async function interpret(text: string, listenedIn: 'A' | 'B', mine: number): Promise<'A' | 'B' | null> {
    set({ phase: 'translating', partial: '' });
    let toSide: 'A' | 'B';
    let said: string;
    if (opts.bothWays) {
      const r = await translateBothWays(text, A, B);
      toSide = r.to ?? (listenedIn === 'A' ? 'B' : 'A');
      said = r.text;
    } else {
      toSide = 'B';
      said = await translateText(text, A, B);
    }
    if (mine !== run) return null;
    const to = toSide === 'A' ? A : B;
    set({ lines: [...st.lines, { id: `line-${++seq}`, heard: text, said, toCode: to.code }] });
    if (opts.speak && said) {
      set({ phase: 'speaking' });
      await speakInAndWait(said, to.code, { messageId: 'interpreter' });
    }
    return toSide;
  }

  async function loop(mine: number): Promise<void> {
    // The language to listen in: both ways with Whisper recognises it by itself (''), otherwise A, then whichever side the last turn went to.
    let next: 'A' | 'B' = 'A';
    const autoDetect = opts.bothWays && hasMultilingualWhisper();
    while (mine === run) {
      try {
        set({ phase: 'listening', partial: '', error: null });
        const session = await listenInLanguage(autoDetect ? '' : (next === 'A' ? A : B).code, {
          keepTextModel: true,
          onPartial: (partial) => { if (mine === run) set({ partial }); },
          onTranscribing: () => { if (mine === run) set({ phase: 'transcribing' }); },
        });
        if (!session) { set({ typing: true, running: false, phase: 'idle' }); return; }
        listening = session;
        const heard = (await session.result).trim();
        listening = null;
        if (mine !== run) return;
        if (!heard) continue; // silence: listen again
        const went = await interpret(heard, next, mine);
        if (mine !== run) return;
        // After A spoke and it went to B, B is expected to answer: the next turn listens in B (and the other way round).
        if (!autoDetect && opts.bothWays && went) next = went === 'B' ? 'B' : 'A';
      } catch (e) {
        listening = null;
        if (e instanceof SpeechCancelled || mine !== run) return;
        set({ error: String((e as Error)?.message || e), running: false, phase: 'idle' });
        return;
      }
    }
  }

  return {
    state: () => st,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start: () => {
      if (st.running) return;
      const mine = ++run;
      set({ running: true, error: null, typing: false });
      void loop(mine).finally(() => { if (mine === run && st.running) set({ running: false, phase: 'idle' }); });
    },
    stop: () => {
      run += 1;
      try { listening?.cancel(); } catch { /* already finished */ }
      listening = null;
      stopSpeech();
      set({ running: false, phase: 'idle', partial: '' });
    },
    say: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const mine = ++run;
      try { set({ running: true, error: null }); await interpret(trimmed, 'A', mine); } catch (e) { set({ error: String((e as Error)?.message || e) }); }
      if (mine === run) set({ running: false, phase: 'idle' });
    },
  };
}
