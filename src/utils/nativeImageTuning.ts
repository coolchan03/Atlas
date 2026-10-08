import type { ONNXImageModel } from '../types';
import { DEFAULT_IMAGE_STEPS, DEFAULT_IMAGE_GUIDANCE, SWEET_SPOT_SIZE } from './imageGenAdvice';

type ImageIdentity = Pick<ONNXImageModel, 'backend' | 'nativeImageFamily' | 'nativeImageVariant'> | null | undefined;
export type ImageSettings = { imageSteps?: number; imageWidth?: number; imageHeight?: number; imageGuidanceScale?: number };

export const isDirectSDXL = (model: ImageIdentity): boolean =>
  model?.backend === 'sdcpp' && model?.nativeImageFamily === 'sdxl';

export const isModernImageModel = (model: ImageIdentity): boolean =>
  model?.backend === 'sdcpp' && ['sdxl', 'z_image', 'anima', 'chroma'].includes(model.nativeImageFamily || '');

const isTurbo = (model: ImageIdentity) => model?.nativeImageVariant === 'turbo';

export function recommendedImageGuidance(model: ImageIdentity): number {
  if (model?.backend !== 'sdcpp') return DEFAULT_IMAGE_GUIDANCE;
  const family = model.nativeImageFamily;
  if (family === 'flux' || (isTurbo(model) && ['z_image', 'anima'].includes(family || ''))) return 1;
  if (family === 'z_image') return 5;
  if (family === 'anima') return 6;
  if (family === 'chroma') return 4;
  return DEFAULT_IMAGE_GUIDANCE;
}
export function getImageGuidance(model: ImageIdentity, current?: number): number {
  if (model?.backend === 'sdcpp' &&
    (model.nativeImageFamily === 'flux' ||
      (isTurbo(model) && ['z_image', 'anima'].includes(model.nativeImageFamily || '')))) return 1;
  return !current || current === DEFAULT_IMAGE_GUIDANCE ? recommendedImageGuidance(model) : current;
}

export function getImageTuning(model: ImageIdentity, settings: ImageSettings) {
  const defaults = {
    steps: settings.imageSteps || DEFAULT_IMAGE_STEPS,
    width: Math.max(SWEET_SPOT_SIZE, settings.imageWidth || SWEET_SPOT_SIZE),
    height: Math.max(SWEET_SPOT_SIZE, settings.imageHeight || SWEET_SPOT_SIZE),
  };
  if (!isModernImageModel(model)) return defaults;
  const family = model?.nativeImageFamily;
  const turbo = isTurbo(model);
  const recommendedSide = family === 'sdxl' ? 1024 : 768;
  const steps = turbo ? (family === 'anima' ? 12 : 8) : 28;
  const side = (value: number) => value === SWEET_SPOT_SIZE
    ? recommendedSide : Math.max(512, Math.min(1024, value));
  return {
    steps: defaults.steps === DEFAULT_IMAGE_STEPS ? steps : defaults.steps,
    width: side(defaults.width), height: side(defaults.height),
  };
}

export function getImageSizeSlider(model: ImageIdentity) {
  if (isModernImageModel(model)) return {
    min: 512, max: 1024, step: 64,
    description: model?.nativeImageFamily === 'sdxl'
      ? 'SDXL works best near 1024px. 512px may be blurry.'
      : 'Larger images add detail but consume more RAM. Start at 768px.',
  };
  return { min: SWEET_SPOT_SIZE, max: 512, step: 64,
    description: 'Smaller = faster; 512px offers more detail on compact models.' };
}

export function imageTestPreset(model: ImageIdentity, quality: boolean, settings: ImageSettings) {
  if (model?.backend === 'sdcpp' && model.nativeImageFamily === 'flux') {
    return { steps: quality ? 24 : 8, width: quality ? 768 : 512,
      height: quality ? 768 : 512, guidanceScale: 1 };
  }
  if (!quality) {
    return { steps: 8, width: isModernImageModel(model) ? 512 : 256,
      height: isModernImageModel(model) ? 512 : 256,
      guidanceScale: recommendedImageGuidance(model) };
  }
  const profile = getImageTuning(model, settings);
  return { ...profile, steps: isModernImageModel(model) ? profile.steps : Math.max(20, profile.steps),
    guidanceScale: recommendedImageGuidance(model) };
}
