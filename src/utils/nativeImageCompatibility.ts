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
}/** Human-readable, architecture-specific component help shown in Atlas. */
export interface ImageSupportGuide {
  kind: SupportKind;
  label: string;
  fileName?: string;
  downloadUrl?: string;
}

const ANIMA_FILES: Partial<Record<SupportKind, Omit<ImageSupportGuide, 'kind'>>> = {
  vae: {
    label: 'Qwen-Image VAE (image decoder)',
    fileName: 'qwen_image_vae.safetensors',
    downloadUrl: 'https://huggingface.co/circlestone-labs/Anima/blob/main/split_files/vae/qwen_image_vae.safetensors',
  },
  llm: {
    label: 'Qwen3-0.6B Base text encoder (not a chat LLM)',
    fileName: 'qwen_3_06b_base.safetensors',
    downloadUrl: 'https://huggingface.co/circlestone-labs/Anima/blob/main/split_files/text_encoders/qwen_3_06b_base.safetensors',
  },
};

const SUPPORT_NAMES: Record<SupportKind, string> = {
  vae: 'VAE (image decoder)',
  llm: 'Image prompt text encoder',
  clip_l: 'CLIP-L text encoder',
  t5xxl: 'T5XXL text encoder',
  lora: 'Style LoRA',
  upscaler: 'Image upscaler',
};

export function getMissingImageSupportGuides(
  model: Pick<ONNXImageModel, 'nativeImageFamily' | 'supportFiles'>,
): ImageSupportGuide[] {
  const isAnima = model.nativeImageFamily === 'anima';
  return getMissingImageSupport(model).map(kind => ({
    kind,
    label: (isAnima ? ANIMA_FILES[kind]?.label : undefined) || SUPPORT_NAMES[kind],
    fileName: isAnima ? ANIMA_FILES[kind]?.fileName : undefined,
    downloadUrl: isAnima ? ANIMA_FILES[kind]?.downloadUrl : undefined,
  }));
}
