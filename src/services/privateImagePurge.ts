import { useAppStore } from '../stores/appStore';
import logger from '../utils/logger';

/**
 * Private chats are never saved, so after a restart nothing can show their pictures.
 * Delete those picture files instead of leaving them on the phone.
 */
export async function purgePrivateChatImages(): Promise<number> {
  const ids = useAppStore.getState().privateImageIds();
  if (!ids.length) return 0;
  const { onnxImageGeneratorService } = require('./index');
  let removed = 0;
  for (const id of ids) {
    try {
      await onnxImageGeneratorService.deleteGeneratedImage(id);
      removed++;
      useAppStore.getState().forgetHiddenImages([id]); // only forgotten once the file is gone
    } catch (e: any) {
      if (e?.code === 'NOT_FOUND') { useAppStore.getState().forgetHiddenImages([id]); continue; } // already gone
      logger.warn('[PrivateImages] could not delete one picture; will retry next start', e);
    }
  }
  return removed;
}
