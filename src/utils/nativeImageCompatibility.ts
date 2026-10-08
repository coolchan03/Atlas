import type { ONNXImageModel } from '../types';

export type NativeFamily = NonNullable<ONNXImageModel['nativeImageFamily']>;
export type SupportKind = NonNullable<ONNXImageModel['supportFiles']>[number]['kind'];

const requirements: Partial<Record<NativeFamily, ReadonlyArray<SupportKind>>> = {
  flux: ['vae', 'clip_l', 't5xxl'],
  z_image: ['vae', 'llm'],
  anima: ['vae', 'llm'],
  chroma: ['vae', 't5xxl'],
};

export const SUPPORTED_NATIVE_FAMILIES: readonly NativeFamily[] =
  ['sd15', 'sdxl', 'flux', 'z_image', 'anima', 'chroma'];

export function getRequiredImageSupport(model: Pick<ONNXImageModel, 'nativeImageFamily'>) {
  return requirements[model.nativeImageFamily || 'unknown'] || [];
}

export function getMissingImageSupport(model: Pick<ONNXImageModel, 'nativeImageFamily' | 'supportFiles'>): SupportKind[] {
  const enabled = new Set(model.supportFiles?.filter(item => item.enabled).map(item => item.kind) || []);
  return getRequiredImageSupport(model).filter(kind => !enabled.has(kind));
}

export function isRunnableNativeModel(model: Pick<ONNXImageModel, 'backend' | 'nativeImageFamily'>): boolean {
  if (model.backend !== 'sdcpp') return true;
  return SUPPORTED_NATIVE_FAMILIES.includes(model.nativeImageFamily || 'unknown');
}

export function imageFamilyDisplay(family?: NativeFamily): string {
  const names: Partial<Record<NativeFamily, string>> = {
    sd15: 'Stable Diffusion 1.x', sdxl: 'SDXL', flux: 'FLUX',
    z_image: 'Z-Image', anima: 'Anima', chroma: 'Chroma',
    auraflow: 'AuraFlow / Pony V7',
  };
  return names[family || 'unknown'] || 'Unknown architecture';
}