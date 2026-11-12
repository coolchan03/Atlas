/**
 * Cloning a voice: one name, a visible Create voice button that says what is missing, and a saved voice that
 * carries that name. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), isErrorWithCode: () => false, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' }, types: {},
}));

const MODEL = 'sherpa-onnx-pocket-tts-int8';

function open(opts: { model?: boolean; sample?: boolean }) {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { NativeModules, Platform, Alert } = require('react-native');
  Platform.OS = 'android';
  NativeModules.AtlasTts = { importVoiceReference: jest.fn() };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { useNeuralVoices } = require('../../../src/atlasVoice/neural');
  const { useCloneReferences } = require('../../../src/atlasVoice/cloneStore');
  const { useVoiceProfiles } = require('../../../src/atlasVoice/profiles');
  useNeuralVoices.setState({ installed: opts.model ? { [MODEL]: 1 } : {} });
  useCloneReferences.setState({ references: opts.sample ? [{ id: 'ref-1', name: 'My voice', seconds: 12, createdAt: '2026-01-01' }] : [] });
  useVoiceProfiles.setState({ profiles: [] });
  const { VoiceCloneCard } = require('../../../src/atlasVoice/VoiceCloneCard');
  return { rtl, view: rtl.render(React.createElement(VoiceCloneCard)), alert, useCloneReferences, useVoiceProfiles };
}

it('tells you what is missing before a voice can be created', () => {
  const { rtl, view } = open({ model: false, sample: false });
  expect(view.getByText('Turn on the permission switch above first.')).toBeTruthy();
  rtl.fireEvent(view.getByTestId('voice-clone-consent'), 'valueChange', true);
  expect(view.getByText('Install the Pocket TTS model in step 1 first.')).toBeTruthy();
});

it('asks for a sample, then a name, then creates a named voice from the one name field', () => {
  const none = open({ model: true, sample: false });
  none.rtl.fireEvent(none.view.getByTestId('voice-clone-consent'), 'valueChange', true);
  expect(none.view.getByText('Record or choose a voice sample in step 2 first.')).toBeTruthy();
  none.view.unmount();

  const { rtl, view, alert, useCloneReferences, useVoiceProfiles } = open({ model: true, sample: true });
  rtl.fireEvent(view.getByTestId('voice-clone-consent'), 'valueChange', true);
  expect(view.getByText('Give the voice a name in step 3.')).toBeTruthy();
  rtl.fireEvent.changeText(view.getByTestId('voice-clone-name'), 'Mom');
  expect(view.queryByText('Give the voice a name in step 3.')).toBeNull();
  rtl.fireEvent.press(view.getByTestId('voice-clone-create'));
  expect(useVoiceProfiles.getState().profiles).toMatchObject([{ name: 'Mom', voiceId: MODEL, referenceId: 'ref-1' }]);
  expect(useCloneReferences.getState().references[0].name).toBe('Mom');
  expect(alert).toHaveBeenCalledWith('Voice created', expect.any(String), expect.any(Array));
  // Pressing Create again renames instead of adding a second copy.
  rtl.fireEvent.changeText(view.getByTestId('voice-clone-name'), 'Mum');
  rtl.fireEvent.press(view.getByTestId('voice-clone-create'));
  expect(useVoiceProfiles.getState().profiles).toMatchObject([{ name: 'Mum' }]);
});
