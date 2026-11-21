import { NativeModules, Platform } from 'react-native';
import { unzip } from 'react-native-zip-archive';

/** Unpack image-model ZIP files with Android streaming I/O when available. */
export async function extractImageModelZip(zipPath: string, modelDir: string): Promise<void> {
  const native = NativeModules.LocalDreamModule;
  if (Platform.OS === 'android' && typeof native?.extractImageZip === 'function') {
    await native.extractImageZip({ zipPath, modelDir });
    return;
  }
  await unzip(zipPath, modelDir);
}
