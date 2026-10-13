/* eslint-disable react-native/no-inline-styles -- Dynamic theme colors for the small accelerator status. */
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Show runtime information; engine selection uses live device probes instead of manual switches. */
export const ImageBackendModePicker: React.FC<{ backend?: string }> = ({ backend }) => {
  const { colors } = useTheme();
  const engine = backend === 'sdcpp' ? 'Vulkan, OpenCL, then CPU fallback'
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
    </View>
  );
};
