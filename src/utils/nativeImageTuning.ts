import type { ONNXImageModel } from '../types';
import { DEFAULT_IMAGE_STEPS, SWEET_SPOT_SIZE } from './imageGenAdvice';

type ImageIdentity = Pick<ONNXImageModel, 'backend' | 'nativeImageFamily'> | null | undefined;
export type ImageSettings = { imageSteps?: number; imageWidth?: number; imageHeight?: number };

/** Use SDXL-native settings without altering tuned mobile MNN/QNN model packages. */
export const isDirectSDXL = (model: ImageIdentity): boolean =>
  model?.backend === 'sdcpp' && model?.nativeImageFamily === 'sdxl';

export function getImageTuning(model: ImageIdentity, settings: ImageSettings) {
  const defaults = {
    steps: settings.imageSteps || DEFAULT_IMAGE_STEPS,
    width: Math.max(SWEET_SPOT_SIZE, settings.imageWidth || SWEET_SPOT_SIZE),
    height: Math.max(SWEET_SPOT_SIZE, settings.imageHeight || SWEET_SPOT_SIZE),
  };
  if (!isDirectSDXL(model)) return defaults;
  // The historical 256px/8-step defaults are meant for compact mobile models.
  // Honor a larger user-selected resolution or different step count.
  const recommendedSide = (side: number) => side === SWEET_SPOT_SIZE ? 1024 : Math.max(512, Math.min(1024, side));
  return {
    steps: defaults.steps === DEFAULT_IMAGE_STEPS ? 28 : defaults.steps,
    width: recommendedSide(defaults.width),
    height: recommendedSide(defaults.height),
  };
}

export const getImageSizeSlider = (model: ImageIdentity) =>
  isDirectSDXL(model)
    ? { min: 512, max: 1024, step: 64, description: 'SDXL works best near 1024x1024. 512 may look blurry or distorted.' }
    : { min: SWEET_SPOT_SIZE, max: 512, step: 64, description: 'Smaller = faster; 512 = more detail for compact models.' };