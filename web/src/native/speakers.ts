// AtlasSpeakers: audio file -> WAV (the recorder's "transcribe a file" path). Speaker labels (diarization) are not
// available here, so `diarize` is left out and the app shows plain transcripts.
import { registerNativeModule } from './registry';
import { fs, norm, dirName } from '../host/fs';
import { decodeTo16k } from '../engines/stt/whisper';
import { toWav } from '../engines/tts/pcmPlayer';

registerNativeModule('AtlasSpeakers', {
  addListener() {}, removeListeners() {},
  async modelsReady() { return false; },
  async decodeToWav(uri: string, outPath: string) {
    const samples = await decodeTo16k(await fs().readFile(norm(uri)));
    await fs().mkdir(dirName(outPath));
    await fs().writeFile(outPath, toWav(samples, 16000));
    return samples.length / 16000;
  },
});
