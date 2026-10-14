import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { cancelSynthesis, synthesizeToFile } from '../atlasVoice/tts';

/**
 * Save narrated slides as an MP4 on the phone, fully offline: the voice chosen in Settings
 * reads each slide to a WAV file, then the native AtlasVideo module draws the slides and
 * encodes H.264 + AAC with MediaCodec/MediaMuxer into Movies/Atlas.
 */
export interface VideoSlide { title: string; bullets: string[]; narration: string }
export interface SavedVideo { uri: string; name: string }
export interface VideoProgress { fraction: number; stage: 'voice' | 'audio' | 'video' | 'done' }

const Native: any = NativeModules.AtlasVideo;
let cancelled = false;

export const videoExportAvailable = (): boolean =>
  Platform.OS === 'android' && !!Native && Number(Platform.Version) >= 29;

export class VideoExportCancelled extends Error {
  constructor() { super('Stopped'); this.name = 'VideoExportCancelled'; }
}

export function cancelVideoExport(): void {
  cancelled = true;
  cancelSynthesis();
  Native?.cancel?.()?.catch?.(() => undefined);
}

/** Text a slide speaks: same as playback in the app. */
export const slideSpeech = (s: VideoSlide): string => `${s.title}. ${s.narration}`;

export async function exportSlidesVideo(
  title: string,
  slides: VideoSlide[],
  onProgress: (p: VideoProgress) => void,
): Promise<SavedVideo> {
  if (!videoExportAvailable()) throw new Error('Saving a video needs Android 10 or newer.');
  if (!slides.length) throw new Error('There are no slides to save.');
  cancelled = false;
  const dir = `${RNFS.CachesDirectoryPath}/atlas-video-${Date.now()}`;
  await RNFS.mkdir(dir);
  const emitter = new NativeEventEmitter(Native);
  const sub = emitter.addListener('AtlasVideoProgress', (e: { fraction: number; stage: VideoProgress['stage'] }) => {
    onProgress({ fraction: 0.2 + 0.8 * e.fraction, stage: e.stage });
  });
  try {
    const specs: { title: string; bullets: string[]; wav: string }[] = [];
    for (let i = 0; i < slides.length; i++) {
      if (cancelled) throw new VideoExportCancelled();
      onProgress({ fraction: 0.2 * (i / slides.length), stage: 'voice' });
      const wav = `${dir}/slide-${i}.wav`;
      try {
        await synthesizeToFile(slideSpeech(slides[i]), wav);
      } catch (e: any) {
        if (cancelled || e?.code === 'CANCELLED') throw new VideoExportCancelled();
        throw e;
      }
      specs.push({ title: slides[i].title, bullets: slides[i].bullets, wav });
    }
    if (cancelled) throw new VideoExportCancelled();
    onProgress({ fraction: 0.2, stage: 'audio' });
    try {
      return await Native.exportSlides(JSON.stringify(specs), title) as SavedVideo;
    } catch (e: any) {
      if (cancelled || e?.code === 'CANCELLED') throw new VideoExportCancelled();
      throw e;
    }
  } finally {
    sub.remove();
    RNFS.unlink(dir).catch(() => undefined);
  }
}

export const shareVideo = (uri: string): Promise<boolean> => Native.share(uri);
export const openVideo = (uri: string): Promise<boolean> => Native.open(uri);
