/* eslint-disable react-native/no-inline-styles -- Dynamic theme colors for the small accelerator status. */
import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useAppStore } from '../stores';
import { useTheme } from '../theme';

/** Show runtime information; engine selection uses live device probes instead of manual switches. */
export const ImageBackendModePicker: React.FC<{ backend?: string }> = ({ backend }) => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useAppStore();
  const engine = backend === 'sdcpp' ? 'Vulkan and OpenCL'
    : backend === 'qnn' ? 'Qualcomm NPU'
      : backend === 'coreml' ? 'Apple Core ML' : 'OpenCL when available';
  return (
    <View style={{ paddingVertical: 9 }}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>
        Automatic hardware acceleration
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        Atlas probes available devices and tries the supported engines automatically: {engine}.
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>
        The actual engine is recorded in generation details. Detection is not a guarantee that a shader can execute.
      </Text>
      {(backend === 'sdcpp' || backend === 'mnn') && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>Allow slow CPU fallback</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Off by default. CPU image generation can take a very long time.
            </Text>
          </View>
          <Switch testID="image-cpu-fallback-opt-in" value={settings.imageAllowCpuFallback ?? false}
            onValueChange={(imageAllowCpuFallback) => updateSettings({ imageAllowCpuFallback })} />
        </View>
      )}
    </View>
  );
};
