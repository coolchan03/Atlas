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
  // Distinguish the Qwen3 encoder from a GGUF chat model or a style LoRA.
  if (/\.(pth|pt)$/i.test(filename)) {
    return new Promise(resolve => Alert.alert('PTH / PT file',
      'PyTorch .pth/.pt files are only supported here as compatible ESRGAN upscalers. They are not LoRA style adapters.', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Attach upscaler', onPress: () => resolve('upscaler') },
      ], { cancelable: true, onDismiss: () => resolve(null) }));
  }
  if (filename.includes('esrgan') || filename.includes('upscal')) return Promise.resolve('upscaler');
  if (filename.includes('vae') || filename.includes('autoencoder')) return Promise.resolve('vae');
  if (filename.includes('t5xxl') || filename.includes('t5_xxl') || filename.includes('t5-v1_1-xxl')) return Promise.resolve('t5xxl');
  if (filename.includes('clip_l') || filename.includes('clip-l')) return Promise.resolve('clip_l');
  if (filename.includes('qwen3') || filename.includes('qwen_3') || filename.includes('qwen-3')) return Promise.resolve('llm');
  if (filename.includes('lora') || filename.includes('lycoris')) return Promise.resolve('lora');

  const encoder = () => new Promise<ImageSupportKind | null>(resolve =>
    Alert.alert('Select text encoder', 'Choose the text encoder actually stored in this file.', [
      { text: 'Qwen3 / LLM', onPress: () => resolve('llm') },
      { text: 'T5XXL', onPress: () => resolve('t5xxl') },
      { text: 'CLIP-L', onPress: () => resolve('clip_l') },
    ], { cancelable: true, onDismiss: () => resolve(null) }));
  if (filename.endsWith('.gguf')) return encoder();
  return new Promise(resolve => Alert.alert('Attach image support file',
    'Choose the actual contents. A style LoRA is not a VAE or text encoder.', [
      { text: 'Style LoRA', onPress: () => resolve('lora') },
      { text: 'VAE', onPress: () => resolve('vae') },
      { text: 'Text encoder', onPress: async () => resolve(await encoder()) },
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
    throw new Error('Attach files to a directly imported SDXL/FLUX/Z-Image/Anima/Chroma model. Precompiled MNN/QNN models cannot load these add-ons.');
  }
  const module = NativeModules.LocalDreamModule;
  const selection = await pick({ type: [types.allFiles], allowMultiSelection: false });
  const chosen = selection?.[0];
  if (!chosen) return null;
  const name = (chosen.name || 'support.safetensors').replace(/^.*[/\\]/, '');

  if (!/\.(safetensors?|gguf|pth|pt)$/i.test(name)) throw new Error('Supported add-on formats: .safetensors, .gguf, .pth or .pt');
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
