import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { showAlert, AlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { importGgufFiles, getErrorMessage } from './importHelpers';

/**
 * Import a text model (.gguf, or model + vision file, or .litertlm) from the phone's storage.
 * Used at first start and in My models; the Models tab has the full version (also image .zip).
 */
export async function quickImportModel(deps: {
  setAlertState: (s: AlertState) => void;
  setImportProgress: (p: { fraction: number; fileName: string } | null) => void;
}): Promise<boolean> {
  try {
    const result = await pick({ type: [types.allFiles], allowMultiSelection: true });
    if (!result?.length) return false;
    const files = result.map((f) => ({ ...f, name: (f.name?.trim() || decodeURIComponent(f.uri.split('/').pop() ?? '') || 'unknown').split('/').pop() || 'unknown' }));
    const ok = files.length <= 2 && (files.every((f) => f.name.toLowerCase().endsWith('.gguf')) || (files.length === 1 && files[0].name.toLowerCase().endsWith('.litertlm')));
    if (!ok) {
      deps.setAlertState(showAlert('Pick a model file', 'Choose a .gguf model (optionally together with its vision "mmproj" .gguf) or a .litertlm model. Image-generation .zip models can be imported in the Models tab.'));
      return false;
    }
    const before = useAppStore.getState().downloadedModels.length;
    await importGgufFiles(files, { ...deps, addDownloadedModel: (m) => useAppStore.getState().addDownloadedModel(m) });
    return useAppStore.getState().downloadedModels.length > before;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return false;
    deps.setAlertState(showAlert('Import failed', getErrorMessage(e)));
    return false;
  } finally {
    deps.setImportProgress(null);
  }
}
