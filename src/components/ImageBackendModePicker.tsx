import React from 'react';
import { Switch, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
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
    <View style={staticStyles.h1}>
      <Text style={[staticStyles.h2, { color: colors.text }]}>
        Hardware acceleration
      </Text>
      <Text style={[staticStyles.h3, { color: colors.textSecondary }]}>
        Auto checks this phone and tries the supported engines in order: {engine}.
      </Text>
      {modes && (
        <View style={staticStyles.h4}>
          {modes.map(option => {
            const on = selected === option.id;
            return (
              <TouchableOpacity key={option.id} testID={`image-engine-${option.id}`} accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => updateSettings({ imageBackendMode: option.id, imageUseOpenCL: option.id !== 'cpu' })}
                style={[staticStyles.h5, { borderColor: on ? colors.primary : colors.border }]}>
                <Text style={{ color: on ? colors.primary : colors.text }}>{option.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={[staticStyles.h6, { color: colors.textMuted }]}>
        {selected === 'cpu' ? 'CPU only: works on every phone, but large models are slow.'
          : selected === 'vulkan' || selected === 'opencl' ? `Always starts on ${selected === 'opencl' ? 'OpenCL' : 'Vulkan'}. Pick the other one if this phone's driver fails or draws garbage.`
            : 'The engine actually used is shown in generation details.'}
      </Text>
      {sd && selected !== 'cpu' && (
        <View style={staticStyles.h7}>
          <View style={staticStyles.h8}>
            <Text style={[staticStyles.h9, { color: colors.text }]}>Allow slow CPU fallback</Text>
            <Text style={[staticStyles.h10, { color: colors.textMuted }]}>
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

const staticStyles = StyleSheet.create({
  h1: { paddingVertical: 9 },
  h2: { fontWeight: '600', marginBottom: 6 },
  h3: { fontSize: 13 },
  h4: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  h5: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 6 },
  h6: { fontSize: 12, marginTop: 5 },
  h7: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  h8: { flex: 1 },
  h9: { fontSize: 13 },
  h10: { fontSize: 12 },
});
