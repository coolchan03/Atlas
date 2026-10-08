import { getImageTuning, getImageSizeSlider, isDirectSDXL, getImageGuidance, imageTestPreset } from '../../../src/utils/nativeImageTuning';

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

  it('uses newer model guidance and dependencies-appropriate render sizes', () => {
    const zImage = { backend: 'sdcpp' as const, nativeImageFamily: 'z_image' as const };
    const anima = { backend: 'sdcpp' as const, nativeImageFamily: 'anima' as const };
    const chroma = { backend: 'sdcpp' as const, nativeImageFamily: 'chroma' as const };
    const settings = { imageSteps: 8, imageWidth: 256, imageHeight: 256, imageGuidanceScale: 7.5 };
    expect(getImageTuning(zImage, settings)).toEqual({ steps: 28, width: 768, height: 768 });
    expect(getImageTuning(anima, settings)).toEqual({ steps: 28, width: 768, height: 768 });
    expect(getImageTuning(chroma, settings)).toEqual({ steps: 28, width: 768, height: 768 });
    expect(getImageGuidance(zImage, settings.imageGuidanceScale)).toBe(5);
    expect(getImageGuidance(anima, settings.imageGuidanceScale)).toBe(6);
    expect(getImageGuidance(chroma, settings.imageGuidanceScale)).toBe(4);
    expect(getImageSizeSlider(zImage).max).toBe(1024);
  });

  it('uses low guidance with distilled Z-Image and Anima Turbo variants', () => {
    const turbo = { backend: 'sdcpp' as const, nativeImageFamily: 'z_image' as const,
      nativeImageVariant: 'turbo' as const };
    expect(getImageGuidance(turbo, 8)).toBe(1);
    expect(getImageTuning(turbo, { imageSteps: 8, imageWidth: 256, imageHeight: 256 }))
      .toEqual({ steps: 8, width: 768, height: 768 });
    expect(imageTestPreset(turbo, false, {})).toEqual({
      steps: 8, width: 512, height: 512, guidanceScale: 1,
    });
  });

  it('offers the native SDXL model a 1024-pixel slider only', () => {
    expect(getImageSizeSlider(sdxl)).toMatchObject({ min: 512, max: 1024 });
    expect(getImageSizeSlider(mnn)).toMatchObject({ min: 256, max: 512 });
  });
});