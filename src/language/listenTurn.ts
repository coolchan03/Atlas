/**
 * How the learner's turn on a practice call is heard. It uses the same engine as Atlas's transcription: the
 * downloaded Whisper model (multilingual, told which language to expect), with the same quiet-after-speech rule as
 * the main call (endOfSpeech.ts). Without a multilingual Whisper model it falls back to the phone's own recognizer,
 * and without that the caller types. Returns one shape for all of them so the call does not care which is active.
 */
import { audioRecorderService } from '../services/audioRecorderService';
import { whisperService, WHISPER_MODELS } from '../services/whisperService';
import { useWhisperStore } from '../stores/whisperStore';
import { SpeechCancelled, listenWithSystemSpeech, systemSpeechStatus, type SystemSpeechSession } from '../services/systemSpeech';
import { CALL_END_OF_SPEECH, EndOfSpeechDetector } from '../atlasVoice/endOfSpeech';
import logger from '../utils/logger';

export type ListenEngine = 'whisper' | 'system';
export interface Listening extends SystemSpeechSession { engine: ListenEngine }
export interface ListenOptions {
  /** Live words while the person talks (only the phone recognizer has them). */
  onPartial?: (text: string) => void;
  /** Whisper is writing down what was said (after the person stopped). */
  onTranscribing?: () => void;
}

/** Whisper's language code for a course language ("es-ES" -> "es"). */
export const whisperLanguage = (code: string): string => code.split('-')[0].toLowerCase();

/** True when the downloaded Whisper model understands more than English (the ".en" models do not). */
export function hasMultilingualWhisper(): boolean {
  const id = useWhisperStore.getState().downloadedModelId;
  return !!id && WHISPER_MODELS.find((m) => m.id === id)?.lang === 'multi';
}

/** Whisper resident without evicting the AI that writes the replies: a call needs both. */
async function whisperReady(): Promise<boolean> {
  if (whisperService.isModelLoaded()) return true;
  try { return (await useWhisperStore.getState().loadModel()) === 'loaded'; } catch { return false; }
}

async function listenWithWhisper(code: string, o: ListenOptions): Promise<Listening> {
  await audioRecorderService.startRecording();
  const detector = new EndOfSpeechDetector(Date.now(), CALL_END_OF_SPEECH);
  let finished = false;
  let resolve!: (text: string) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  result.catch(() => undefined);

  const stop = async () => {
    if (finished) return;
    finished = true;
    audioRecorderService.setLevelListener(null);
    try {
      const { path } = await audioRecorderService.stopRecording();
      o.onTranscribing?.();
      resolve(await whisperService.transcribeFile(path, { language: whisperLanguage(code) }));
    } catch (e: any) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  };
  audioRecorderService.setLevelListener((rms) => {
    const verdict = detector.push(rms, Date.now());
    if (verdict === 'end') stop();
    else if (verdict === 'nothing' && !finished) {
      finished = true;
      audioRecorderService.setLevelListener(null);
      audioRecorderService.cancelRecording();
      resolve('');
    }
  });
  return {
    engine: 'whisper', result,
    stop: () => { stop(); },
    cancel: () => {
      if (finished) return;
      finished = true;
      audioRecorderService.setLevelListener(null);
      audioRecorderService.cancelRecording();
      reject(new SpeechCancelled());
    },
  };
}

/** Starts listening for the learner, with the best engine there is; null when nothing on this phone can listen. */
export async function listenInLanguage(code: string, o: ListenOptions = {}): Promise<Listening | null> {
  if (hasMultilingualWhisper() && (await whisperReady())) {
    try { return await listenWithWhisper(code, o); } catch (e) { logger.warn('[CALL] Whisper could not start, using the phone recognizer:', e); }
  }
  if (!(await systemSpeechStatus()).available) return null;
  const session = await listenWithSystemSpeech({ locale: code, onPartial: o.onPartial, endSilenceMs: CALL_END_OF_SPEECH.silenceMs });
  return { ...session, engine: 'system' };
}
