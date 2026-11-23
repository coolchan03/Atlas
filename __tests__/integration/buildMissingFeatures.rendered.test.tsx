import { requireRTL } from '../harness/nativeBoundary';

it('a 32-bit ARM build says which features it lacks, in the version card, on the Models tab notes and in the backend choices, and refuses to load a model with a clear reason', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { Platform, NativeModules } = require('react-native');
  // The phone reports what the APK contains (a device boundary): a 32-bit ARM build has voices and Whisper, nothing else native.
  Platform.OS = 'android';
  NativeModules.DeviceMemoryModule = { ...(NativeModules.DeviceMemoryModule ?? {}), buildInfo: { abi: 'armeabi-v7a', nativeLibs: ['libonnxruntime.so', 'libsherpa-onnx-jni.so', 'librnwhisper.so'] } };
  const { resetBuildCapabilities } = require('../../src/services/buildCapabilities');
  resetBuildCapabilities();
  const { BuildFeaturesCard } = require('../../src/components/BuildFeaturesCard');
  const { MissingFeatureForTab } = require('../../src/components/MissingFeatureNote');
  const { BackendSelector } = require('../../src/components/settings/textGenAdvancedSections');
  const { llmService } = require('../../src/services/llm');

  const card = rtl.render(React.createElement(BuildFeaturesCard));
  expect(card.getByTestId('build-abi').props.children.join('')).toMatch(/Built for 32-bit ARM \(armeabi-v7a\)\. 6 features are not in this version\./);
  expect(card.getByText('On-device AI models: not in this version')).toBeTruthy();
  expect(card.getByText('Offline transcription (Whisper)')).toBeTruthy(); // present, so no "missing"
  expect(card.queryByText(/Offline transcription \(Whisper\): not in this version/)).toBeNull();
  card.unmount();

  // The Models tabs: Text and Image say so; Transcription has what it needs and says nothing.
  const text = rtl.render(React.createElement(MissingFeatureForTab, { tab: 'text' }));
  expect(text.getByTestId('missing-localAi')).toBeTruthy();
  text.unmount();
  const whisper = rtl.render(React.createElement(MissingFeatureForTab, { tab: 'transcription' }));
  expect(whisper.queryByTestId('missing-whisper')).toBeNull();
  whisper.unmount();

  // The backend choices: engines this build lacks are labelled missing and cannot be picked.
  const backends = rtl.render(React.createElement(BackendSelector));
  expect(backends.getByText('NPU (missing)')).toBeTruthy();
  expect(backends.getByText('OpenCL (missing)')).toBeTruthy();
  expect(backends.getByText('Vulkan (missing)')).toBeTruthy();
  expect(backends.getByText('CPU only')).toBeTruthy();
  expect(backends.getByTestId('backend-htp-button').props.accessibilityState?.disabled ?? backends.getByTestId('backend-htp-button').props.disabled).toBeTruthy();

  // A model cannot be loaded: the reason is the message, not a native error.
  await expect(llmService.loadModel('/models/x.gguf')).rejects.toThrow(/on-device AI engine is not built into this version/);
});
