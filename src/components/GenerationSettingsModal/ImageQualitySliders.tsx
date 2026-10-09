import React from 'react';
import { View, Text, Switch, Platform, TouchableOpacity } from 'react-native';
import { SliderSetting } from '../SliderSetting';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { useClearGpuCache } from '../../hooks/useImageGenerationSettings';
import { getImageTuning, getImageSizeSlider, isDirectSDXL, getImageGuidance } from '../../utils/nativeImageTuning';
import { createStyles } from './styles';

const ClearGPUCacheButton: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { clearing, handleClearCache } = useClearGpuCache();

  return (
    <TouchableOpacity
      style={[styles.settingHeader, styles.clearCacheButton, { backgroundColor: colors.surfaceLight }]}
      onPress={handleClearCache}
      disabled={clearing}
    >
      <Text style={[styles.settingDescription, { color: colors.primary }]}>
        {clearing ? 'Clearing...' : 'Clear GPU Cache'}
      </Text>
    </TouchableOpacity>
  );
};

/** Basic controls: Image Steps + Image Size */
export const ImageQualityBasicSliders: React.FC = () => {
  const { settings, updateSettings, activeImageModelId, downloadedImageModels } = useAppStore();
  const model = downloadedImageModels.find(m => m.id === activeImageModelId);
  const preset = getImageTuning(model, settings);
  const sizeOptions = getImageSizeSlider(model);
  const isXL = isDirectSDXL(model);

  return (
    <>
      <SliderSetting
        testID="image-steps"
        label="Image Steps"
        description={isXL ? "28 steps recommended for SDXL" : "4-8 steps for speed, 20-50 for quality"}
        value={preset.steps}
        min={isXL ? 20 : 4} max={50} step={1}
        onChange={(value) => updateSettings({ imageSteps: value })}
      />

      <SliderSetting
        testID="image-size"
        label="Image Size"
        description={sizeOptions.description}
        value={preset.width}
        min={sizeOptions.min} max={sizeOptions.max} step={sizeOptions.step}
        formatValue={(v) => `${v}x${v}`}
        onChange={(value) => updateSettings({ imageWidth: value, imageHeight: value })}
      />
    </>
  );
};

/** Advanced controls: Guidance Scale, Image Threads, GPU Acceleration */
export const ImageQualityAdvancedSliders: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, updateSettings, activeImageModelId, downloadedImageModels } = useAppStore();
  const imageModel = downloadedImageModels.find(m => m.id === activeImageModelId);

  return (
    <>
      <SliderSetting
        testID="guidance-scale"
        label="Guidance Scale"
        description="Higher = follows prompt more strictly (5-15 range)"
        value={getImageGuidance(imageModel, settings.imageGuidanceScale)}
        min={1} max={20} step={0.5} decimals={1}
        onChange={(value) => updateSettings({ imageGuidanceScale: value })}
      />

      {(Platform.OS !== 'android' || imageModel?.backend === 'sdcpp') && (
        <SliderSetting
          testID="image-threads"
          label="Image Threads"
          description="CPU threads used for image generation. Takes effect next time the image model loads."
          value={settings.imageThreads ?? 4}
          min={1} max={8} step={1}
          onChange={(value) => updateSettings({ imageThreads: value })}
        />
      )}

      {Platform.OS === 'android' && (
        <View style={styles.settingGroup}>
          <View style={styles.settingHeader}>
            <Text style={styles.settingLabel}>
              {imageModel?.backend === 'sdcpp' ? 'Vulkan GPU Acceleration' : 'OpenCL GPU Acceleration'}
            </Text>
            <Switch
              value={settings.imageUseOpenCL ?? true}
              onValueChange={(value) => updateSettings({ imageUseOpenCL: value })}
              trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          <Text style={styles.settingDescription}>
            {imageModel?.backend === 'sdcpp'
              ? 'Atlas prefers Adreno Vulkan GPU for diffusion, with CPU fallback if unavailable. See selected backend in Image Model Test.'
              : 'Use OpenCL for supported MNN image models.'}
          </Text>
          {(settings.imageUseOpenCL ?? true) && imageModel?.backend !== 'sdcpp' && <ClearGPUCacheButton />}
        </View>
      )}
    </>
  );
};
