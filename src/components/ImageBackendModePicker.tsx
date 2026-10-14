/* eslint-disable react-native/no-inline-styles -- Dynamic theme colors for the small accelerator status. */
import React from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../stores';
import { useTheme } from '../theme';
import { imageComputeMode, type ImageComputeMode } from '../services/imageAcceleratorSelection';

/** Image engine choice: Auto (probe and try each engine) or a fixed engine, plus the CPU opt-in. */
export const ImageBackendModePicker: React.FC<{ backend?: string }> = ({ backend }) => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useAppStore();
  const sd = backend === 'sdcpp';
  const raw = imageComputeMode(settings);
  const selected: ImageComputeMode = sd ? (raw === 'gpu' ? 'vulkan' : raw) : (raw === 'cpu' ? 'cpu' : 'auto');
  const engine = sd ? 'Vulkan, then OpenCL'
    : backend === 'qnn' ? 'Qualcomm NPU'
      : backend === 'coreml' ? 'Apple Core ML' : 'OpenCL when available';
  // NPU and Core ML packages run on one engine only, so there is nothing to choose.
  const modes: Array<{ id: ImageComputeMode; name: string }> | null = sd
    ? [{ id: 'auto', name: 'Auto' }, { id: 'vulkan', name: 'Vulkan' }, { id: 'opencl', name: 'OpenCL' }, { id: 'cpu', name: 'CPU' }]
    : backend === 'mnn' ? [{ id: 'auto', name: 'Auto' }, { id: 'cpu', name: 'CPU' }] : null;
  return (
    <View style={{ paddingVertical: 9 }}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>
        Hardware acceleration
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        Auto checks this phone and tries the supported engines in order: {engine}.
      </Text>
      {modes && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {modes.map(option => {
            const on = selected === option.id;
            return (
              <TouchableOpacity key={option.id} testID={`image-engine-${option.id}`} accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => updateSettings({ imageBackendMode: option.id, imageUseOpenCL: option.id !== 'cpu' })}
                style={{ borderWidth: 1, borderColor: on ? colors.primary : colors.border, borderRadius: 8,
                  paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 6 }}>
                <Text style={{ color: on ? colors.primary : colors.text }}>{option.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>
        {selected === 'cpu' ? 'CPU only: works on every phone, but large models are slow.'
          : selected === 'vulkan' || selected === 'opencl' ? `Always starts on ${selected === 'opencl' ? 'OpenCL' : 'Vulkan'}. Pick the other one if this phone's driver fails or draws garbage.`
            : 'The engine actually used is shown in generation details.'}
      </Text>
      {sd && selected !== 'cpu' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>Allow slow CPU fallback</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              If the GPU fails, finish the image on the CPU. This can take a long time.
            </Text>
          </View>
          <Switch testID="image-cpu-fallback-opt-in" value={settings.imageAllowCpuFallback ?? false}
            onValueChange={(imageAllowCpuFallback) => updateSettings({ imageAllowCpuFallback })} />
        </View>
      )}
    </View>
  );
};
