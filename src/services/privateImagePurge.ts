import { useAppStore } from '../stores/appStore';
import logger from '../utils/logger';

/**
 * Private chats are never saved, so after a restart nothing can show their pictures.
 * Delete those picture files instead of leaving them on the phone.
 */
export async function purgePrivateChatImages(): Promise<number> {
  const ids = useAppStore.getState().takePrivateImageIds();
  if (!ids.length) return 0;
  const { onnxImageGeneratorService } = require('./index');
  let removed = 0;
  for (const id of ids) {
    try { if (await onnxImageGeneratorService.deleteGeneratedImage(id)) removed++; }
    catch (e) { logger.warn('[PrivateImages] could not delete one picture', e); }
  }
  return removed;
}
