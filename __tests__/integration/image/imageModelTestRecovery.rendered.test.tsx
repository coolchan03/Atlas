/** Real Test screen and image services; only Android/FS boundaries are faked. */
import { GB, installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { createONNXImageModel } from '../../utils/factories';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: () => {} }),
  useRoute: () => ({ params: { modelId: 'native-image-test' } }),
}));

async function setup(settings: Record<string, unknown> = {}) {
  const boundary = installNativeBoundary({
    fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB },
  });
  boundary.diffusion.module.getLoadedBackend = jest.fn(async () => 'sdcpp');
  boundary.diffusion.module.getAtlasImageGpuDiagnostics = jest.fn(async () =>
    ({ enumerated: true, detail: 'vulkan0' }));
  boundary.diffusion.module.getAtlasImageGpuDiagnosticsFor = jest.fn(async () =>
    ({ enumerated: true, detail: 'GPUOpenCL' }));
  (boundary.fs!.module.read as jest.Mock).mockResolvedValue('iVBORw0KGgo=');
  const React = require('react');
  const rtl = requireRTL();
  const { useAppStore } = require('../../../src/stores');
  const { ImageModelTestScreen } = require('../../../src/screens/ImageModelTestScreen');
  // Seed user choices after startup hydration, as they are when opening this screen.
  await rtl.waitFor(() => expect(useAppStore.persist.hasHydrated()).toBe(true));
  const model = {
    ...createONNXImageModel({ id: 'native-image-test', name: 'Native image test',
      modelPath: '/docs/image_models/test', backend: 'sdcpp', size: GB / 2 }),
    nativeImageFamily: 'sd15',
  };
  useAppStore.setState({ downloadedImageModels: [model], activeImageModelId: model.id });
  useAppStore.getState().updateSettings({
    imageBackendMode: 'auto', imageAllowCpuFallback: false, imageThreads: 4,
    enhanceImagePrompts: false, ...settings,
  });
  const view = rtl.render(React.createElement(ImageModelTestScreen));
  return { boundary, rtl, view };
}

describe('image model Test shares runtime recovery', () => {
  it('lets the user choose CPU directly when both GPU probes fail', async () => {
    const { boundary, rtl, view } = await setup();
    boundary.diffusion.module.getAtlasImageGpuDiagnostics.mockResolvedValue(
      { enumerated: false, detail: 'Vulkan unavailable' },
    );
    boundary.diffusion.module.getAtlasImageGpuDiagnosticsFor.mockResolvedValue(
      { enumerated: false, detail: 'OpenCL unavailable' },
    );
    rtl.fireEvent.press(view.getByTestId('image-engine-cpu'));
    rtl.fireEvent.press(view.getByText('Start test'));
    await rtl.waitFor(() => expect(view.getByText(/Generated image/)).toBeTruthy());
    expect(boundary.diffusion.module.generateImage.mock.calls[0][0].computeBackend).toBe('cpu');
    view.unmount();
  });

  it('renders with OpenCL after Vulkan fails and shows the backend used', async () => {
    const { boundary, rtl, view } = await setup();
    boundary.diffusion.module.generateImage.mockRejectedValueOnce(
      new Error('Vulkan shader compilation failed'),
    );

    rtl.fireEvent.press(view.getByText('Start test'));

    await rtl.waitFor(() => expect(view.getByText(/Generated image/)).toBeTruthy());
    expect(view.queryByText(/OPENCL.*completed render/)).not.toBeNull();
    expect(view.queryByText(/Vulkan failed/)).not.toBeNull();
    expect(view.queryByText(/Test failed:/)).toBeNull();
    expect(boundary.diffusion.module.generateImage.mock.calls.map(([params]) =>
      params.computeBackend)).toEqual(['vulkan', 'opencl']);
    view.unmount();
  });

  it('uses CPU when the user opted in and neither GPU is available', async () => {
    const { boundary, rtl, view } = await setup({ imageAllowCpuFallback: true });
    boundary.diffusion.module.getAtlasImageGpuDiagnostics.mockResolvedValue(
      { enumerated: false, detail: 'Vulkan not detected' },
    );
    boundary.diffusion.module.getAtlasImageGpuDiagnosticsFor.mockResolvedValue(
      { enumerated: false, detail: 'OpenCL not detected' },
    );

    rtl.fireEvent.press(view.getByText('Start test'));

    await rtl.waitFor(() => expect(view.getByText(/Generated image/)).toBeTruthy());
    expect(view.queryByText(/CPU.*completed render/)).not.toBeNull();
    expect(view.queryByText(/Test failed:/)).toBeNull();
    expect(boundary.diffusion.module.generateImage.mock.calls.map(([params]) =>
      params.computeBackend)).toEqual(['cpu']);
    view.unmount();
  });

  it('uses opted-in CPU after the explicitly selected Vulkan engine fails', async () => {
    const { boundary, rtl, view } = await setup({ imageBackendMode: 'vulkan', imageAllowCpuFallback: true });
    boundary.diffusion.module.generateImage.mockRejectedValueOnce(
      new Error('Vulkan shader compilation failed'),
    );

    rtl.fireEvent.press(view.getByText('Start test'));

    await rtl.waitFor(() => expect(view.getByText(/Generated image/)).toBeTruthy());
    expect(view.queryByText(/CPU.*completed render/)).not.toBeNull();
    expect(view.queryByText(/Vulkan failed/)).not.toBeNull();
    expect(boundary.diffusion.module.generateImage.mock.calls.map(([params]) =>
      params.computeBackend)).toEqual(['vulkan', 'cpu']);
    view.unmount();
  });

  it('does not publish a completed image when cancelled during output validation', async () => {
    const { boundary, rtl, view } = await setup();
    let resolveHeader: ((header: string) => void) | undefined;
    (boundary.fs!.module.read as jest.Mock).mockImplementationOnce(() =>
      new Promise(resolve => { resolveHeader = resolve; }),
    );

    rtl.fireEvent.press(view.getByText('Start test'));
    await rtl.waitFor(() => expect(resolveHeader).toBeDefined());
    rtl.fireEvent.press(view.getByText(/Cancel test/));
    await rtl.act(async () => { resolveHeader!('iVBORw0KGgo='); });

    await rtl.waitFor(() => expect(view.queryByText(/Cancel test/)).toBeNull());
    expect(view.queryByText(/Cancellation requested/)).not.toBeNull();
    expect(view.queryByText(/Generated image/)).toBeNull();
    expect(view.queryByText(/completed render/)).toBeNull();
    view.unmount();
  });

  it('does not try another backend after the user cancels a failing attempt', async () => {
    const { boundary, rtl, view } = await setup({ imageAllowCpuFallback: true });
    let rejectAttempt: ((error: Error) => void) | undefined;
    boundary.diffusion.module.generateImage.mockImplementationOnce(() =>
      new Promise((_resolve, reject) => { rejectAttempt = reject; }),
    );

    rtl.fireEvent.press(view.getByText('Start test'));
    await rtl.waitFor(() => expect(rejectAttempt).toBeDefined());
    rtl.fireEvent.press(view.getByText(/Cancel test/));
    await rtl.act(async () => {
      rejectAttempt!(new Error('Vulkan driver stopped'));
    });

    await rtl.waitFor(() => expect(view.queryByText(/Cancel test/)).toBeNull());
    expect(view.queryByText(/Cancellation requested/)).not.toBeNull();
    expect(view.queryByText(/Generated image/)).toBeNull();
    expect(view.queryByText(/Test failed:/)).toBeNull();
    expect(boundary.diffusion.module.generateImage.mock.calls.map(([params]) =>
      params.computeBackend)).toEqual(['vulkan']);
    view.unmount();
  });
});
