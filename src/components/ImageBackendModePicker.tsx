import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../stores';
import { useTheme } from '../theme';
import { imageComputeMode, type ImageComputeMode } from '../services/imageAcceleratorSelection';

/** Shared, controlled GPU policy for both image settings surfaces. */
export const ImageBackendModePicker: React.FC<{ backend?: string }> = ({ backend }) => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useAppStore();
  const raw = imageComputeMode(settings);
  // Imported (sd.cpp) checkpoints have two GPU engines; other runtimes have one accelerator.
  const sd = backend === 'sdcpp';
  const selected: ImageComputeMode = sd ? (raw === 'gpu' ? 'vulkan' : raw)
    : (raw === 'vulkan' || raw === 'opencl' ? 'gpu' : raw);
  const runtime = sd ? 'Vulkan or OpenCL' :
    backend === 'qnn' ? 'QNN NPU' : backend === 'coreml' ? 'Core ML' : 'OpenCL';
  const modes: Array<{ id: ImageComputeMode; name: string }> = sd
    ? [{ id: 'auto', name: 'Auto' }, { id: 'vulkan', name: 'Vulkan' }, { id: 'opencl', name: 'OpenCL' }, { id: 'cpu', name: 'CPU' }]
    : [{ id: 'auto', name: 'Auto' }, { id: 'gpu', name: 'Accelerator' }, { id: 'cpu', name: 'CPU' }];
  return (
    <View style={{ paddingVertical: 9 }}>
      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>
        Image compute backend ({runtime})
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {modes.map(option => (
          <TouchableOpacity key={option.id} accessibilityRole="button"
            accessibilityState={{ selected: selected === option.id }}
            onPress={() => updateSettings({
              imageBackendMode: option.id,
              // Retain the old setting for native/MNN compatibility.
              imageUseOpenCL: option.id !== 'cpu',
            })}
            style={{
              borderWidth: 1, borderColor: selected === option.id ? colors.primary : colors.border,
              borderRadius: 8, paddingHorizontal: 15, paddingVertical: 9, marginRight: 8,
              marginBottom: 6,
            }}>
            <Text style={{ color: selected === option.id ? colors.primary : colors.text }}>
              {option.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {sd
          ? (selected === 'cpu' ? 'CPU only. Slow, but works on every phone.'
            : selected === 'auto' ? 'Tries Vulkan, then OpenCL, then the CPU. If a GPU run fails, the next one is used and the chat says why.'
              : `Uses ${selected === 'opencl' ? 'OpenCL' : 'Vulkan'}; if it fails, the image is made on the CPU and the chat says why.`)
          : selected === 'cpu' ? 'CPU explicitly selected (requires compatible CPU weights).' :
            selected === 'gpu' ? 'Use this model runtime accelerator or report an error.' :
              'Detect a compatible accelerator for this model runtime. Never silently choose CPU.'}
        {' '}Device detection does not prove that a shader can execute.
      </Text>
    </View>
  );
};
