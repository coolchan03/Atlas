import { Platform } from 'react-native';
import { useAppStore } from '../stores/appStore';
import { hardwareService } from '../services/hardware';
import logger from '../utils/logger';

/**
 * Atlas: use the GPU by default on Snapdragon (Adreno) phones and tablets.
 * Runs once after settings load; never overrides a backend the user picked themselves.
 * If the GPU fails for a model, the app already falls back to the CPU automatically.
 */
export function autoPickAcceleration(): void {
  if (Platform.OS !== 'android') return;
  const run = async () => {
    try {
      const st = useAppStore.getState();
      const s: any = st.settings;
      if (s.backendUserChosen || s.atlasAccelChecked) return;
      // Only on a fresh install (no models yet): never change the backend for people already using the app.
      if (st.downloadedModels.length > 0) { st.updateSettings({ atlasAccelChecked: true } as any); return; }
      const soc = await hardwareService.getSoCInfo();
      const patch: any = { atlasAccelChecked: true };
      if (soc.vendor === 'qualcomm' && s.inferenceBackend === 'cpu') {
        patch.inferenceBackend = 'opencl';
        patch.gpuLayers = 99;
        logger.log('[Atlas] Snapdragon detected: GPU (OpenCL) selected by default');
      }
      st.updateSettings(patch);
    } catch { /* leave as is */ }
  };
  const p: any = (useAppStore as any).persist;
  if (p?.hasHydrated?.()) run(); else p?.onFinishHydration?.(() => { run(); });
}
