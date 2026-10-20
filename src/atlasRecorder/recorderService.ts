import RNFS from 'react-native-fs';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { audioRecorderService } from '../services/audioRecorderService';
import { whisperService } from '../services/whisperService';
import { activeModelService } from '../services/activeModelService';
import { ensureWhisperForTranscription } from '../components/ChatInput/ensureWhisperForTranscription';
import { useWhisperStore } from '../stores/whisperStore';
import { ragService } from '../services/rag';
import { keepScreenOn } from '../atlasVoice/tts';
import { generateId } from '../utils/generateId';
import logger from '../utils/logger';
import { useRecordings, useRecorderLive, type Recording } from './store';
import { labelTranscript, transcriptText, type SpeakerTurn } from './transcript';

const Speakers: any = NativeModules.AtlasSpeakers;
const SPEAKER_MODELS_URL = 'https://github.com/coolchan03/Atlas/releases/download/atlas-voices/atlas-speakers.zip';
const dir = () => `${RNFS.DocumentDirectoryPath}/atlas-recordings`;

const live = (p: Partial<ReturnType<typeof useRecorderLive.getState>>) => useRecorderLive.setState(p);
const update = (id: string, p: Partial<Recording>) => useRecordings.setState((s) => ({
  recordings: s.recordings.map((r) => (r.id === id ? { ...r, ...p } : r)),
}));
const find = (id: string) => useRecordings.getState().recordings.find((r) => r.id === id);

let listening = false;
function listenProgress() {
  if (listening || !Speakers) return;
  listening = true;
  new NativeEventEmitter(Speakers).addListener('AtlasSpeakersProgress', (e: { progress: number }) => {
    const st = useRecorderLive.getState();
    if (st.speakerDownload !== null) live({ speakerDownload: e.progress });
    else if (st.phase === 'processing') live({ progress: e.progress });
  });
}

let stopTranscribe: (() => Promise<void>) | null = null;
let cancelled = false;

/** "Recording, 20 Oct, 14:05" */
const defaultTitle = (d: Date) => `Recording, ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

async function ensureWhisper(): Promise<boolean> {
  return ensureWhisperForTranscription({
    isLoaded: () => whisperService.isModelLoaded(),
    hasDownloadedModel: () => !!useWhisperStore.getState().downloadedModelId,
    loadWhisper: () => useWhisperStore.getState().loadModel(),
    freeGenerationModels: () => activeModelService.unloadAllModels(true).then(() => undefined),
  });
}

async function speakerTurns(path: string, speakers: number): Promise<SpeakerTurn[] | null> {
  if (!Speakers || !(await Speakers.modelsReady())) return null;
  live({ step: 'Finding who spoke', progress: 0 });
  return Speakers.diarize(path, speakers);
}

/**
 * The recorder: records with a visible indicator, then transcribes and labels speakers on
 * the phone. Owns the recording state machine; screens observe useRecorderLive /
 * useRecordings and call these intents.
 */
export const recorderService = {
  speakerLabelsAvailable: (): boolean => !!Speakers?.diarize,

  acceptConsent(): void { useRecordings.setState({ consent: true }); },

  async start(): Promise<void> {
    if (!useRecordings.getState().consent) throw new Error('Confirm that everyone knows they are being recorded first.');
    if (useRecorderLive.getState().phase !== 'idle') return;
    await audioRecorderService.startRecording();
    keepScreenOn(true);
    live({ phase: 'recording', startedAt: Date.now() });
  },

  /** Stops, saves the audio and starts making the transcript. Resolves the new recording's id. */
  async stop(): Promise<string> {
    if (useRecorderLive.getState().phase !== 'recording') throw new Error('Not recording.');
    keepScreenOn(false);
    const started = useRecorderLive.getState().startedAt;
    let result: { path: string; durationSeconds: number };
    try {
      result = await audioRecorderService.stopRecording();
    } catch {
      live({ phase: 'idle' });
      throw new Error('The recording stopped early: another part of Atlas used the microphone.');
    }
    const id = generateId();
    await RNFS.mkdir(dir());
    const audioPath = `${dir()}/${id}.wav`;
    await RNFS.moveFile(result.path.replace(/^file:\/\//, ''), audioPath);
    const rec: Recording = {
      id, title: defaultTitle(new Date(started)), createdAt: new Date(started).toISOString(),
      durationSec: result.durationSeconds || (Date.now() - started) / 1000, audioPath, status: 'processing',
    };
    useRecordings.setState((s) => ({ recordings: [rec, ...s.recordings] }));
    live({ phase: 'idle' });
    recorderService.process(id).catch(() => undefined);
    return id;
  },

  /** Throws the recording away without saving. */
  discard(): void {
    if (useRecorderLive.getState().phase !== 'recording') return;
    keepScreenOn(false);
    audioRecorderService.cancelRecording();
    live({ phase: 'idle' });
  },

  /** Transcribes and labels speakers. `speakers` = number of people if known (0 = let Atlas decide). */
  async process(id: string, speakers = 0): Promise<void> {
    const rec = find(id);
    if (!rec || useRecorderLive.getState().phase !== 'idle') return;
    cancelled = false;
    listenProgress();
    live({ phase: 'processing', processingId: id, step: 'Loading the transcription model', progress: 0 });
    update(id, { status: 'processing', error: undefined });
    try {
      let segments = rec.segments;
      if (!segments) {
        if (!(await ensureWhisper())) throw new Error('Download a speech-to-text model first (Models -> Transcription).');
        live({ step: 'Transcribing', progress: 0 });
        const job = whisperService.transcribeSegments(rec.audioPath, { onProgress: (p) => live({ progress: p / 100 }) });
        stopTranscribe = job.stop;
        segments = await job.promise;
        stopTranscribe = null;
        update(id, { segments });
      }
      if (cancelled) throw new Error('cancelled');
      const turns = await speakerTurns(rec.audioPath, speakers);
      update(id, {
        utterances: labelTranscript(segments, turns ?? []),
        labelled: !!turns, status: 'done',
        speakerNames: turns ? {} : find(id)?.speakerNames,
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      logger.warn(`[REC-SM] processing failed: ${msg}`);
      update(id, { status: 'failed', error: /cancel/i.test(msg) ? 'Stopped before the transcript was finished.' : msg });
    } finally {
      stopTranscribe = null;
      live({ phase: 'idle', processingId: null, step: '', progress: 0 });
    }
  },

  async cancelProcessing(): Promise<void> {
    cancelled = true;
    await stopTranscribe?.().catch(() => undefined);
    await Speakers?.cancel?.().catch(() => undefined);
  },

  async downloadSpeakerModels(): Promise<void> {
    if (!Speakers) throw new Error('Speaker labels need the updated Android Atlas.');
    listenProgress();
    live({ speakerDownload: 0 });
    try { await Speakers.downloadModels(SPEAKER_MODELS_URL); } finally { live({ speakerDownload: null }); }
  },

  speakerModelsReady: async (): Promise<boolean> => !!Speakers && !!(await Speakers.modelsReady()),

  rename(id: string, title: string): void { if (title.trim()) update(id, { title: title.trim() }); },

  nameSpeaker(id: string, speaker: number, name: string): void {
    update(id, { speakerNames: { ...find(id)?.speakerNames, [speaker]: name.trim() } });
  },

  /** Corrects who said one part of the transcript. */
  setSpeaker(id: string, index: number, speaker: number): void {
    const rec = find(id);
    if (!rec?.utterances?.[index]) return;
    update(id, { utterances: rec.utterances.map((u, i) => (i === index ? { ...u, speaker } : u)) });
  },

  async remove(id: string): Promise<void> {
    const rec = find(id);
    if (rec) await RNFS.unlink(rec.audioPath).catch(() => undefined);
    useRecordings.setState((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) }));
  },

  /** Adds the transcript to a project's shared documents. */
  async saveToProject(id: string, projectId: string): Promise<void> {
    const rec = find(id);
    if (!rec?.utterances?.length) throw new Error('This recording has no transcript yet.');
    await ragService.saveProjectNote({ projectId, name: rec.title, text: transcriptText(rec.title, rec.utterances, rec.speakerNames) });
  },
};
