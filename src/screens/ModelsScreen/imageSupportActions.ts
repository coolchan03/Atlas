import { Alert, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { modelManager } from '../../services';
import { useAppStore } from '../../stores';
import { ONNXImageModel } from '../../types';
import { activeModelService } from '../../services/activeModelService';

export type ImageSupport = NonNullable<ONNXImageModel['supportFiles']>[number];
export type ImageSupportKind = ImageSupport['kind'];

function chooseKind(name: string): Promise<ImageSupportKind | null> {
  const filename = name.toLowerCase();
  if (/\.(pth|pt)$/i.test(filename) || filename.includes('esrgan') || filename.includes('upscal')) {
    return Promise.resolve('upscaler');
  }
  if (filename.includes('t5xxl') || filename.includes('t5_xxl')) return Promise.resolve('t5xxl');
  if (filename.includes('clip_l') || filename.includes('clip-l')) return Promise.resolve('clip_l');
  if (filename.includes('vae')) return Promise.resolve('vae');
  if (/\.(gguf)$/i.test(filename)) {
    return new Promise(resolve => Alert.alert('Attach GGUF encoder', 'Choose the type of encoder. FLUX GGUF is the main model, while T5XXL and CLIP-L are accompanying components.', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'T5XXL', onPress: () => resolve('t5xxl') },
      { text: 'CLIP-L', onPress: () => resolve('clip_l') },
    ], { cancelable: true, onDismiss: () => resolve(null) }));
  }
  return new Promise(resolve => Alert.alert('Attach image support file', 'Select what this file contains. Style LoRAs are usually much smaller than full models.', [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    { text: 'LoRA / style', onPress: () => resolve('lora') },
    { text: 'VAE', onPress: () => resolve('vae') },
  ], { cancelable: true, onDismiss: () => resolve(null) }));
}

async function persist(m: ONNXImageModel, files: ImageSupport[]) {
  const next: ONNXImageModel = { ...m, supportFiles: files };
  await modelManager.addDownloadedImageModel(next);
  useAppStore.getState().addDownloadedImageModel(next);
}

export async function pickAndAttachImageSupport(
  model: ONNXImageModel,
  setBusy: (label: string, fraction: number) => void,
): Promise<ImageSupport | null> {
  if (Platform.OS !== 'android' || model.backend !== 'sdcpp') {
    throw new Error('Attach support files to a directly imported SDXL/SD/FLUX model. Precompiled MNN/QNN models cannot load these add-ons.');
  }
  const module = NativeModules.LocalDreamModule;
  const selection = await pick({ type: [types.allFiles], allowMultiSelection: false });
  const chosen = selection?.[0];
  if (!chosen) return null;
  const name = (chosen.name || 'support.safetensors').replace(/^.*[/\\]/, '');

  if (!/\.(safetensors|gguf|pth|pt)$/i.test(name)) throw new Error('Supported add-on formats: .safetensors, .gguf, .pth or .pt');
  const kind = await chooseKind(name);
  if (!kind) return null;
  if (model.id === useAppStore.getState().activeImageModelId) {
    await activeModelService.unloadImageModel(true);
  }
  const sub = new NativeEventEmitter(module).addListener('LocalDreamConvert',
    (e: { stage?: string; fraction?: number }) => {
      if (e.stage === 'copy') setBusy('Attaching ' + name, Math.min(0.99, Math.max(0, e.fraction ?? 0)));
    });
  try {
    setBusy('Attaching ' + name, 0);
    const file = await module.attachAtlasImageSupport({
      modelDir: model.modelPath, uri: chosen.uri, fileName: name, kind, strength: 0.75,
    }) as ImageSupport;
    const updated = [...(model.supportFiles ?? []).filter(x =>
      x.kind !== kind || (kind === 'lora' && x.name !== file.name)), file];
    await persist(model, updated);
    return file;
  } finally { sub.remove(); }
}

export async function modifyImageSupport(
  model: ONNXImageModel, file: ImageSupport, change: { delete?: boolean; enabled?: boolean; strength?: number },
): Promise<void> {
  if (model.backend !== 'sdcpp') throw new Error('This image backend cannot modify attachments');
  if (model.id === useAppStore.getState().activeImageModelId) {
    await activeModelService.unloadImageModel(true);
  }
  const enabled = change.enabled ?? file.enabled;
  const strength = Math.max(-2, Math.min(2, change.strength ?? file.strength));
  await NativeModules.LocalDreamModule.modifyAtlasImageSupport({
    modelDir: model.modelPath, kind: file.kind, name: file.name, delete: !!change.delete,
    enabled, strength,
  });
  await persist(model, (model.supportFiles ?? []).flatMap(f => {
    if (f.kind !== file.kind || f.name !== file.name) return [f];
    return change.delete ? [] : [{ ...f, enabled, strength }];
  }));
}

export function isPickerCancel(e: unknown): boolean {
  return isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;
}
