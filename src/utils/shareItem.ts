import { NativeModules, Platform, Share } from 'react-native';

/**
 * ONE way to share anything from Atlas: text (a transcript, a report, a place) or a file (a track, an image).
 * React Native's Share ignores a file link on Android, so files go through the phone's share sheet with Atlas's file provider.
 * Closing the sheet is not an error. Returns whether the sheet opened.
 */
export async function shareItem(item: { title?: string; text?: string; file?: string }): Promise<boolean> {
  const { title = 'Atlas', text, file } = item;
  try {
    if (file) {
      const device = Platform.OS === 'android' ? NativeModules.AtlasDevice : undefined;
      if (device?.shareFile) { await device.shareFile(file, title); return true; }
      await Share.share({ title, url: file.startsWith('file://') ? file : `file://${file}` });
      return true;
    }
    await Share.share({ title, message: text ?? '' });
    return true;
  } catch { return false; }
}
