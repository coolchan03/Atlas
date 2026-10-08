import { getImageTuning, getImageSizeSlider, isDirectSDXL } from '../../../src/utils/nativeImageTuning';

describe('SDXL tuning without altering tuned mobile image models', () => {
  const sdxl = { backend: 'sdcpp' as const, nativeImageFamily: 'sdxl' as const };
  const mnn = { backend: 'mnn' as const };
  const flux = { backend: 'sdcpp' as const, nativeImageFamily: 'flux' as const };

  it('replaces incompatible 256px/8-step defaults for a native SDXL checkpoint', () => {
    expect(isDirectSDXL(sdxl)).toBe(true);
    expect(getImageTuning(sdxl, { imageSteps: 8, imageWidth: 256, imageHeight: 256 }))
      .toEqual({ steps: 28, width: 1024, height: 1024 });
  });

  it('preserves non-SDXL and deliberately selected settings', () => {
    expect(getImageTuning(mnn, { imageSteps: 8, imageWidth: 256, imageHeight: 256 }))
      .toEqual({ steps: 8, width: 256, height: 256 });
    expect(getImageTuning(flux, { imageSteps: 8, imageWidth: 256, imageHeight: 256 }))
      .toEqual({ steps: 8, width: 256, height: 256 });
    expect(getImageTuning(sdxl, { imageSteps: 24, imageWidth: 512, imageHeight: 768 }))
      .toEqual({ steps: 24, width: 512, height: 768 });
  });

  it('offers the native SDXL model a 1024-pixel slider only', () => {
    expect(getImageSizeSlider(sdxl)).toMatchObject({ min: 512, max: 1024 });
    expect(getImageSizeSlider(mnn)).toMatchObject({ min: 256, max: 512 });
  });
});