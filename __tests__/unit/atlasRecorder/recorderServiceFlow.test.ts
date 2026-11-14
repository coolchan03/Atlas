/** The recorder state machine with the microphone, speech model and speaker models faked at their edges. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

type Over = { hold?: boolean; speakers?: Record<string, unknown> | null; whisperReady?: boolean; segments?: unknown[]; transcribeFails?: string; turns?: unknown[] };

async function load(over: Over = {}) {
  jest.resetModules();
  const boundary = installNativeBoundary({ fs: true });
  const rn = require('react-native');
  const speakers = over.speakers === null ? undefined : {
    modelsReady: jest.fn(async () => true), diarize: jest.fn(async () => over.turns ?? [{ speaker: 0, start: 0, end: 5 }]), decodeToWav: jest.fn(async () => 42),
    cancel: jest.fn(async () => undefined), downloadModels: jest.fn(async () => undefined), ...(over.speakers ?? {}),
  };
  rn.NativeModules.AtlasSpeakers = speakers;
  const progressHandlers: Array<(e: { progress: number }) => void> = [];
  class FakeEmitter { addListener(_n: string, fn: (e: { progress: number }) => void) { progressHandlers.push(fn); return { remove() { /* none */ } }; } }
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: FakeEmitter });

  const recorder = { startRecording: jest.fn(async () => undefined), stopRecording: jest.fn(async () => ({ path: 'file:///tmp/rec.wav', durationSeconds: 7 })), cancelRecording: jest.fn() };
  jest.doMock('../../../src/services/audioRecorderService', () => ({ audioRecorderService: recorder }));
  const stop = jest.fn(async () => undefined);
  let release: () => void = () => undefined;
  const held = new Promise<unknown[]>((res) => { release = () => res(over.segments ?? [{ start: 0, end: 2, text: 'hello there' }]); });
  const transcribe = jest.fn(() => ({ stop, promise: over.hold ? held : over.transcribeFails ? Promise.reject(new Error(over.transcribeFails)) : Promise.resolve(over.segments ?? [{ start: 0, end: 2, text: 'hello there' }]) }));
  jest.doMock('../../../src/services/whisperService', () => ({ whisperService: { isModelLoaded: () => true, transcribeSegments: (...a: unknown[]) => (transcribe as any)(...a) } }));
  jest.doMock('../../../src/components/ChatInput/ensureWhisperForTranscription', () => ({ ensureWhisperForTranscription: async () => over.whisperReady !== false }));
  const shareItem = jest.fn(async () => undefined);
  jest.doMock('../../../src/utils/shareItem', () => ({ shareItem }));
  const saveProjectNote = jest.fn(async () => undefined);
  jest.doMock('../../../src/services/rag', () => ({ ragService: { saveProjectNote } }));
  const exportFiles = {
    safeFileName: (t: string, ext: string) => `${t}.${ext}`,
    saveExistingFile: jest.fn(async (_p: string, name: string) => name),
    saveToPhone: jest.fn(async (name: string, _m: string, write: (p: string) => Promise<void>) => { await write('/out/file'); return name; }),
  };
  jest.doMock('../../../src/study/exportFiles', () => exportFiles);
  const picked: { value: unknown } = { value: [{ uri: 'content://audio/1', name: 'Meeting.m4a' }] };
  jest.doMock('@react-native-documents/picker', () => ({
    pick: jest.fn(async () => { if (picked.value instanceof Error) throw picked.value; return picked.value; }),
    types: { audio: 'audio', video: 'video' }, errorCodes: { OPERATION_CANCELED: 'CANCELED' }, isErrorWithCode: (e: any) => !!e?.code,
  }));

  const { recorderService } = require('../../../src/atlasRecorder/recorderService');
  const stores = require('../../../src/atlasRecorder/store');
  await stores.useRecordings.persist.rehydrate();
  return { release: () => release(), recorderService, recordings: stores.useRecordings, live: stores.useRecorderLive, recorder, transcribe, stop, speakers, picked, shareItem, saveProjectNote, exportFiles, boundary, progressHandlers };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

describe('recording', () => {
  it('needs consent, refuses a second start, saves the audio and starts the transcript', async () => {
    const { recorderService, recordings, live, recorder, boundary } = await load();
    await expect(recorderService.start()).rejects.toThrow('Confirm that everyone knows');
    recorderService.acceptConsent();
    boundary.fs!.seedFile('/tmp/rec.wav', 100);
    await Promise.all([recorderService.start(), recorderService.start()]);
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);
    expect(live.getState().phase).toBe('recording');
    const id = await recorderService.stop();
    await settle();
    const rec = recordings.getState().recordings.find((r: any) => r.id === id);
    expect(rec).toMatchObject({ status: 'done', durationSec: 7, labelled: true });
    expect(rec.utterances.length).toBeGreaterThan(0);
    expect(live.getState().phase).toBe('idle');
    await expect(recorderService.stop()).rejects.toThrow('Not recording');
  });

  it('says so when another part of the app took the microphone, or the audio cannot be saved', async () => {
    const first = await load();
    first.recorderService.acceptConsent();
    await first.recorderService.start();
    first.recorder.stopRecording.mockRejectedValueOnce(new Error('mic'));
    await expect(first.recorderService.stop()).rejects.toThrow('another part of Atlas used the microphone');
    expect(first.live.getState().phase).toBe('idle');
    const second = await load();
    second.recorderService.acceptConsent();
    await second.recorderService.start();
    const RNFS = require('react-native-fs');
    jest.spyOn(RNFS, 'moveFile').mockRejectedValueOnce(new Error('no space'));
    await expect(second.recorderService.stop()).rejects.toThrow('could not be saved: no space');
  });

  it('throws a recording away', async () => {
    const { recorderService, live, recorder } = await load();
    recorderService.discard();
    expect(recorder.cancelRecording).not.toHaveBeenCalled();
    recorderService.acceptConsent();
    await recorderService.start();
    recorderService.discard();
    expect(recorder.cancelRecording).toHaveBeenCalled();
    expect(live.getState().phase).toBe('idle');
  });
});

describe('transcribing', () => {
  const seed = (r: Awaited<ReturnType<typeof load>>, extra: Record<string, unknown> = {}) => {
    r.recordings.setState({ recordings: [{ id: 'r1', title: 'Talk', createdAt: '2026-01-01', durationSec: 5, audioPath: '/atlas/r1.wav', status: 'failed', ...extra }] });
  };

  it('transcribes with progress, keeps the segments, and labels speakers when the models are there', async () => {
    const r = await load();
    seed(r);
    const run = r.recorderService.process('r1', 2);
    await settle();
    r.progressHandlers.forEach((h) => h({ progress: 0.5 }));
    await run;
    const rec = r.recordings.getState().recordings[0];
    expect(rec).toMatchObject({ status: 'done', labelled: true });
    expect(rec.segments).toHaveLength(1);
    expect(r.speakers!.diarize).toHaveBeenCalledWith('/atlas/r1.wav', 2);
  });

  it('skips transcribing when the segments are kept, and works without speaker models', async () => {
    const r = await load({ speakers: { modelsReady: jest.fn(async () => false) } });
    seed(r, { segments: [{ start: 0, end: 1, text: 'kept words' }] });
    await r.recorderService.process('r1');
    expect(r.transcribe).not.toHaveBeenCalled();
    expect(r.recordings.getState().recordings[0]).toMatchObject({ status: 'done', labelled: false });
    const none = await load({ speakers: null });
    seed(none, { segments: [{ start: 0, end: 1, text: 'kept words' }] });
    await none.recorderService.process('r1');
    expect(none.recordings.getState().recordings[0].status).toBe('done');
    expect(none.recorderService.speakerLabelsAvailable()).toBe(false);
    expect(await none.recorderService.speakerModelsReady()).toBe(false);
  });

  it('fails readably with no speech model, a transcription error, or a stop', async () => {
    const noModel = await load({ whisperReady: false });
    seed(noModel);
    await noModel.recorderService.process('r1');
    expect(noModel.recordings.getState().recordings[0].error).toMatch(/Download a speech-to-text model/);
    const broken = await load({ transcribeFails: 'engine crashed' });
    seed(broken);
    await broken.recorderService.process('r1');
    expect(broken.recordings.getState().recordings[0]).toMatchObject({ status: 'failed', error: 'engine crashed' });
    const stopped = await load({ transcribeFails: 'cancelled by user' });
    seed(stopped);
    await stopped.recorderService.process('r1');
    expect(stopped.recordings.getState().recordings[0].error).toMatch(/Stopped before the transcript/);
    await stopped.recorderService.process('missing');
  });

  it('cancels a transcription in progress', async () => {
    const r = await load({ hold: true });
    seed(r);
    const run = r.recorderService.process('r1');
    await settle();
    await r.recorderService.cancelProcessing();
    expect(r.stop).toHaveBeenCalled();
    expect(r.speakers!.cancel).toHaveBeenCalled();
    r.release();
    await run;
    expect(r.recordings.getState().recordings[0].error).toMatch(/Stopped before the transcript/);
  });
});

describe('importing a file', () => {
  it('turns a file into a recording and transcribes it', async () => {
    const r = await load();
    expect(r.recorderService.canImportFiles()).toBe(true);
    const id = await r.recorderService.importFile();
    await settle();
    const rec = r.recordings.getState().recordings.find((x: any) => x.id === id);
    expect(rec).toMatchObject({ title: 'Meeting', durationSec: 42 });
  });

  it('returns null when the picker is closed or empty, and refuses where decoding is missing', async () => {
    const r = await load();
    r.picked.value = Object.assign(new Error('closed'), { code: 'CANCELED' });
    expect(await r.recorderService.importFile()).toBeNull();
    r.picked.value = [];
    expect(await r.recorderService.importFile()).toBeNull();
    r.picked.value = Object.assign(new Error('boom'), { code: 'OTHER' });
    await expect(r.recorderService.importFile()).rejects.toThrow('boom');
    await expect((await load({ speakers: null })).recorderService.importFile()).rejects.toThrow('updated Android Atlas');
    r.live.setState({ phase: 'recording' });
    r.picked.value = [{ uri: 'x', name: 'a.mp3' }];
    expect(await r.recorderService.importFile()).toBeNull();
  });

  it('explains a file that cannot be read or a read that was stopped', async () => {
    const bad = await load({ speakers: { decodeToWav: jest.fn(async () => { throw new Error('no audio track'); }) } });
    await expect(bad.recorderService.importFile()).rejects.toThrow('Could not read this file: no audio track');
    const stopped = await load({ speakers: { decodeToWav: jest.fn(async () => { throw new Error('Cancelled'); }) } });
    await expect(stopped.recorderService.importFile()).rejects.toThrow('Stopped before the file was read');
  });
});

describe('speaker models and editing', () => {
  it('downloads the speaker models with progress and clears the progress either way', async () => {
    const r = await load();
    const run = r.recorderService.downloadSpeakerModels();
    r.progressHandlers.forEach((h) => h({ progress: 0.4 }));
    await run;
    expect(r.live.getState().speakerDownload).toBeNull();
    expect(await r.recorderService.speakerModelsReady()).toBe(true);
    const failing = await load({ speakers: { downloadModels: jest.fn(async () => { throw new Error('offline'); }) } });
    await expect(failing.recorderService.downloadSpeakerModels()).rejects.toThrow('offline');
    expect(failing.live.getState().speakerDownload).toBeNull();
    await expect((await load({ speakers: null })).recorderService.downloadSpeakerModels()).rejects.toThrow('updated Android Atlas');
  });

  it('renames, names speakers, corrects who spoke and removes a recording with its audio', async () => {
    const r = await load();
    r.recordings.setState({ recordings: [{ id: 'r1', title: 'Talk', createdAt: '2026-01-01', durationSec: 5, audioPath: '/atlas/r1.wav', status: 'done', utterances: [{ start: 0, end: 1, text: 'hi', speaker: 0 }, { start: 1, end: 2, text: 'yo', speaker: 0 }] }] });
    const rec = () => r.recordings.getState().recordings[0];
    r.recorderService.rename('r1', '  New title ');
    r.recorderService.rename('r1', '   ');
    expect(rec().title).toBe('New title');
    r.recorderService.nameSpeaker('r1', 1, ' Sam ');
    expect(rec().speakerNames).toEqual({ 1: 'Sam' });
    r.recorderService.setSpeaker('r1', 1, 1);
    r.recorderService.setSpeaker('r1', 9, 1);
    r.recorderService.setSpeaker('nope', 0, 1);
    expect(rec().utterances[1].speaker).toBe(1);
    await r.recorderService.remove('r1');
    expect(r.recordings.getState().recordings).toHaveLength(0);
    await r.recorderService.remove('r1');
  });
});

describe('sharing and saving', () => {
  const withTranscript = async () => {
    const r = await load();
    r.recordings.setState({ recordings: [
      { id: 'r1', title: 'Talk', createdAt: '2026-01-01', durationSec: 5, audioPath: '/atlas/r1.wav', status: 'done', utterances: [{ start: 0, end: 1, text: 'hi', speaker: 0 }] },
      { id: 'r2', title: 'Empty', createdAt: '2026-01-01', durationSec: 5, audioPath: '/atlas/r2.wav', status: 'done' },
    ] });
    return r;
  };

  it('returns, shares, saves and files the transcript, and refuses when there is none', async () => {
    const r = await withTranscript();
    expect(r.recorderService.transcript('r1')).toContain('hi');
    expect(() => r.recorderService.transcript('r2')).toThrow('no transcript yet');
    await r.recorderService.shareTranscript('r1');
    expect(r.shareItem).toHaveBeenCalled();
    expect(await r.recorderService.saveTranscript('r1')).toBe('Talk.txt');
    await r.recorderService.saveToProject('r1', 'p1');
    expect(r.saveProjectNote).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', name: 'Talk' }));
    await expect(r.recorderService.saveToProject('r2', 'p1')).rejects.toThrow('no transcript yet');
  });

  it('saves the audio when the file is there and says so when it is missing', async () => {
    const r = await withTranscript();
    await expect(r.recorderService.saveAudio('r1')).rejects.toThrow('audio for this recording is missing');
    await expect(r.recorderService.saveAudio('nope')).rejects.toThrow('missing');
    r.boundary.fs!.seedFile('/atlas/r1.wav', 100);
    expect(await r.recorderService.saveAudio('r1')).toBe('Talk.wav');
  });
});

export {};
