/**
 * Take a photo or choose one from the library, for every feature that reads a picture (the Translator's camera, the Photo
 * studio). The camera and the speech session collide on iOS, so speech is released first and put back after.
 */
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import { audioSessionManager } from './audioSessionManager';

export interface Picked { asset?: Asset; /** A plain sentence for the person when nothing was picked because of a problem. */ error?: string }

export async function pickPicture(source: 'camera' | 'library'): Promise<Picked> {
  try {
    await audioSessionManager.deactivate(); // a no-op on Android
    const opts = { mediaType: 'photo' as const, quality: 0.8 as const, maxWidth: 1600, maxHeight: 1600 };
    const result = source === 'camera' ? await launchCamera(opts) : await launchImageLibrary(opts);
    if (result.errorCode === 'permission') return { error: source === 'camera' ? "Atlas needs permission to use the camera. Allow it in the phone's app settings." : "Atlas needs permission to read your pictures. Allow it in the phone's app settings." };
    if (result.errorCode) return { error: result.errorMessage || 'The picture could not be opened.' };
    return { asset: result.assets?.[0] };
  } catch { return {}; /* the picker reports its own problems */ } finally { audioSessionManager.ensurePlayback().catch(() => undefined); }
}
