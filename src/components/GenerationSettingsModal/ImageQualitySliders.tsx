/* eslint-disable react-native/no-inline-styles -- Image setting chips use the selected theme colors. */
import React from 'react';
import { View, Text, Platform, TouchableOpacity } from 'react-native';
import { SliderSetting } from '../SliderSetting';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { useClearGpuCache } from '../../hooks/useImageGenerationSettings';
import { getImageTuning, getImageSizeSlider, isDirectSDXL, getImageGuidance } from '../../utils/nativeImageTuning';
import { createStyles } from './styles';
import { ImageBackendModePicker } from '../ImageBackendModePicker';

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
  const { colors } = useTheme();
  const { settings, updateSettings, activeImageModelId, downloadedImageModels } = useAppStore();
  const model = downloadedImageModels.find(m => m.id === activeImageModelId);
  const preset = getImageTuning(model, settings);
  const sizeOptions = getImageSizeSlider(model);
  const isXL = isDirectSDXL(model);
  const square = Math.max(sizeOptions.min, Math.min(sizeOptions.max, isXL ? 768 : 512));
  const large = Math.max(square, Math.min(sizeOptions.max, Math.round(square * 1.5 / 64) * 64));
  // Shapes only where they differ and the runtime can render them (imported sd.cpp checkpoints).
  const showAspect = model?.backend === 'sdcpp' && large > square;
  // The size slider keeps the chosen shape: it sets the width and scales the height with it.
  const ratio = preset.width > 0 ? preset.height / preset.width : 1;
  const heightFor = (w: number) => Math.max(sizeOptions.min, Math.round((w * ratio) / 64) * 64);
  const aspectPresets = [
    { label: 'Square', width: square, height: square },
    { label: 'Portrait', width: square, height: large },
    { label: 'Landscape', width: large, height: square },
  ];

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
        formatValue={(v) => `${v}x${heightFor(v)}`}
        onChange={(value) => updateSettings({ imageWidth: value, imageHeight: heightFor(value) })}
      />
      {showAspect && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 7 }}>
        {aspectPresets.map(option => {
          const selected = settings.imageWidth === option.width && settings.imageHeight === option.height;
          return (
            <TouchableOpacity key={option.label} testID={`image-aspect-${  option.label.toLowerCase()}`}
              accessibilityRole="button" accessibilityState={{ selected }}
              onPress={() => updateSettings({ imageWidth: option.width, imageHeight: option.height })}
              style={{ borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
                backgroundColor: selected ? colors.surfaceLight : colors.background,
                borderColor: selected ? colors.primary : colors.border }}>
              <Text style={{ color: selected ? colors.primary : colors.textSecondary }}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>}
    </>
  );
};

/** Advanced controls: Guidance Scale, Image Threads, GPU Acceleration */
export const ImageQualityAdvancedSliders: React.FC = () => {
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
          <ImageBackendModePicker backend={imageModel?.backend} />
          {settings.imageBackendMode !== 'cpu' && imageModel?.backend === 'mnn' &&
            <ClearGPUCacheButton />}
        </View>
      )}
    </>
  );
};
