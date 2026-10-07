import { Platform } from 'react-native';
import { useAppStore } from '../stores/appStore';
import { hardwareService } from '../services/hardware';
import { INFERENCE_BACKENDS, type DownloadedModel } from '../types';
import { automaticBackendForModel } from '../utils/acceleration';
import logger from '../utils/logger';

/**
 * Atlas automatic acceleration policy.
 *
 * - Never overrides a backend the user explicitly picked.
 * - At startup, prefer Android GPU/OpenCL when the device probe says it is available.
 * - NPU/HTP is selected per-model (not blindly at boot) because it is experimental
 *   and only a subset of model families/quantizations benefit from it.
 * - Existing installs are re-evaluated too: the old atlasAccelChecked boolean is kept
 *   only as migration/diagnostic state, not as a permanent "never check again" gate.
 */
export function autoPickAcceleration(): void {
  if (Platform.OS !== 'android') return;

  const run = async () => {
    try {
      const st = useAppStore.getState();
      const settings = st.settings;
      if (settings.backendUserChosen) return;

      const capability = await hardwareService.getAccelerationCapability();
      const patch: Partial<typeof settings> = { atlasAccelChecked: true };

      if (capability.hasGpu && settings.inferenceBackend === INFERENCE_BACKENDS.CPU) {
        patch.inferenceBackend = INFERENCE_BACKENDS.OPENCL;
        patch.gpuLayers = 99;
        logger.log('[Atlas] Automatic acceleration: GPU/OpenCL selected');
      } else if (!capability.hasGpu && settings.inferenceBackend === INFERENCE_BACKENDS.OPENCL) {
        // Repair a stale automatic OpenCL selection when the current device probe says
        // there is no compatible GPU. Explicit user selections never reach this branch.
        patch.inferenceBackend = INFERENCE_BACKENDS.CPU;
        logger.log('[Atlas] Automatic acceleration: OpenCL unavailable; restored CPU');
      }

      st.updateSettings(patch);
    } catch (error) {
      logger.warn('[Atlas] Automatic acceleration probe failed; keeping current backend:', error);
    }
  };

  const persist: any = (useAppStore as any).persist;
  if (persist?.hasHydrated?.()) run();
  else persist?.onFinishHydration?.(() => { run(); });
}

/**
 * Re-evaluate the automatic backend for the exact llama model being loaded.
 * This is where NPU selection belongs because model family + quantization are known.
 */
export async function autoPickAccelerationForModel(model: DownloadedModel): Promise<void> {
  if (Platform.OS !== 'android' || model.engine !== 'llama') return;

  const st = useAppStore.getState();
  if (st.settings.backendUserChosen) return;

  try {
    const capability = await hardwareService.getAccelerationCapability();
    const target = automaticBackendForModel(capability, model.name, model.quantization);
    if (target === st.settings.inferenceBackend) return;

    st.updateSettings({
      inferenceBackend: target,
      gpuLayers: target === INFERENCE_BACKENDS.CPU ? st.settings.gpuLayers : 99,
      atlasAccelChecked: true,
    });

    const label = target === INFERENCE_BACKENDS.HTP
      ? 'NPU/HTP'
      : target === INFERENCE_BACKENDS.OPENCL
        ? 'GPU/OpenCL'
        : 'CPU';
    logger.log(`[Atlas] Automatic acceleration for ${model.name}: ${label} (quant=${model.quantization || 'unknown'})`);
  } catch (error) {
    logger.warn('[Atlas] Per-model acceleration probe failed; keeping current backend:', error);
  }
}
