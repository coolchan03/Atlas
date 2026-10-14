/** The image engine picker offers Auto / Vulkan / OpenCL / CPU for imported checkpoints and saves the choice. */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ImageBackendModePicker } from '../../../src/components/ImageBackendModePicker';
import { useAppStore } from '../../../src/stores/appStore';

describe('ImageBackendModePicker', () => {
  beforeEach(() => useAppStore.setState({ settings: { ...useAppStore.getState().settings, imageBackendMode: 'auto', imageAllowCpuFallback: false } }));

  it('lets the user force OpenCL for an imported checkpoint', () => {
    const view = render(<ImageBackendModePicker backend="sdcpp" />);
    fireEvent.press(view.getByTestId('image-engine-opencl'));
    expect(useAppStore.getState().settings.imageBackendMode).toBe('opencl');
    expect(view.getByText(/Always starts on OpenCL/)).toBeTruthy();
  });

  it('CPU only hides the fallback switch; MNN models offer Auto or CPU', () => {
    const view = render(<ImageBackendModePicker backend="sdcpp" />);
    expect(view.getByTestId('image-cpu-fallback-opt-in')).toBeTruthy();
    fireEvent.press(view.getByTestId('image-engine-cpu'));
    expect(view.queryByTestId('image-cpu-fallback-opt-in')).toBeNull();
    const mnn = render(<ImageBackendModePicker backend="mnn" />);
    expect(mnn.queryByTestId('image-engine-vulkan')).toBeNull();
    expect(mnn.getByTestId('image-engine-cpu')).toBeTruthy();
  });
});
