import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { showAlert, AlertState } from '../../components/CustomAlert';
import { useAppStore } from '../../stores';
import { importGgufFiles, getErrorMessage } from './importHelpers';
import { inspectNativeImageFile, importNativeImageFile } from './nativeImageImport';

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
    const ok = files.length <= 2 && (files.every((f) => f.name.toLowerCase().endsWith('.gguf')) || (files.length === 1 && /\.(litertlm|safetensors?)$/i.test(files[0].name)));
    if (!ok) {
      deps.setAlertState(showAlert('Pick a model file', 'Choose .safetensors for image models, .gguf for image or language models, .litertlm, or two language GGUFs (model and mmproj). Image-model ZIP packages remain in the Models tab.'));
      return false;
    }
    if (files.length === 1) {
      const file = files[0];
      if (/\.safetensors?$/i.test(file.name)) {
        return await importNativeImageFile(file.uri, file.name, deps);
      }
      if (/\.gguf$/i.test(file.name)) {
        const info = await inspectNativeImageFile(file.uri, file.name);
        if (info.kind === 'image' || info.kind === 'lora') {
          return await importNativeImageFile(file.uri, file.name, deps);
        }
      }
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
