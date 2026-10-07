/**
 * Standalone utility helpers for ActiveModelService.
 */

import { useAppStore } from '../../stores';
import { hardwareService } from '../hardware';
import { llmService } from '../llm';
import { liteRTService } from '../litert';
import { localDreamGeneratorService as onnxImageGeneratorService } from '../localDreamGenerator';
import { ResourceUsage } from './types';

export async function getResourceUsage(): Promise<ResourceUsage> {
  const info = await hardwareService.refreshMemoryInfo();
  const store = useAppStore.getState();
  let estimatedModelMemory = 0;

  if (store.activeModelId) {
    const tm = store.downloadedModels.find(m => m.id === store.activeModelId);
    if (tm?.fileSize) {
      estimatedModelMemory += tm.fileSize * 1.2;
    }
  }
  if (store.activeImageModelId) {
    const im = store.downloadedImageModels.find(m => m.id === store.activeImageModelId);
    if (im?.size) {
      estimatedModelMemory += im.size * 1.3;
    }
  }

  return {
    memoryUsed: info.usedMemory,
    memoryTotal: info.totalMemory,
    memoryAvailable: info.availableMemory,
    memoryUsagePercent: (info.usedMemory / info.totalMemory) * 100,
    estimatedModelMemory,
  };
}

export interface SyncStateTarget {
  setLoadedTextModelId: (id: string | null) => void;
  setLoadedImageModelId: (id: string | null) => void;
  setLoadedImageModelThreads: (n: number | null) => void;
  loadedTextModelId: string | null;
  loadedImageModelId: string | null;
}

export async function syncWithNativeState(target: SyncStateTarget): Promise<void> {
  const store = useAppStore.getState();

  const llamaLoaded = llmService.isModelLoaded();
  const liteRTLoaded = liteRTService.isModelLoaded();
  const llamaPath = llamaLoaded ? llmService.getLoadedModelPath?.() ?? null : null;
  const liteRTPath = liteRTLoaded ? liteRTService.getLoadedModelPath?.() ?? null : null;
  const nativeTextModel = store.downloadedModels.find((model) =>
    (model.engine === 'litert' && !!liteRTPath && model.filePath === liteRTPath) ||
    (model.engine !== 'litert' && !!llamaPath && model.filePath === llamaPath),
  );
  if (!llamaLoaded && !liteRTLoaded) {
    target.setLoadedTextModelId(null);
  } else if (nativeTextModel) {
    // Correct stale selected/resident identity after backgrounding or a native
    // engine recovery instead of assuming the currently selected id is resident.
    if (target.loadedTextModelId !== nativeTextModel.id) {
      target.setLoadedTextModelId(nativeTextModel.id);
    }
  } else if (!target.loadedTextModelId && store.activeModelId) {
    // Compatibility fallback for engines/tests that can report loaded=true but
    // cannot expose a path. Never overwrite an already-known resident id.
    target.setLoadedTextModelId(store.activeModelId);
  }

  const imageModelLoaded = await onnxImageGeneratorService.isModelLoaded();
  if (!imageModelLoaded) {
    target.setLoadedImageModelId(null);
    target.setLoadedImageModelThreads(null);
  } else {
    const loadedImagePath = await onnxImageGeneratorService.getLoadedModelPath?.() ?? null;
    const nativeImageModel = store.downloadedImageModels.find(m => m.modelPath === loadedImagePath);
    if (nativeImageModel) {
      target.setLoadedImageModelId(nativeImageModel.id);
    } else if (!target.loadedImageModelId && store.activeImageModelId) {
      target.setLoadedImageModelId(store.activeImageModelId);
    }
  }
}
