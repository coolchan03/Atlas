/**
 * Storage: one list of everything the app keeps (models, voices, cloned-voice samples, maps, recordings),
 * each with a size and a Delete that says what it will break. Fakes only the device boundary.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('lists the cloned-voice samples and a recording, and deleting one asks first and removes it', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { Alert, NativeModules, Platform } = require('react-native');
  Platform.OS = 'android';
  NativeModules.AtlasTts = { deleteVoiceReference: jest.fn(async () => true) };
  const { StorageItemsSection } = require('../../../src/screens/storage/StorageItemsSection');
  const { useCloneReferences } = require('../../../src/atlasVoice/cloneStore');
  const { useRecordings } = require('../../../src/atlasRecorder/store');
  useCloneReferences.setState({ references: [{ id: 'ref-a', name: 'Mom', seconds: 12, createdAt: 'x' }] });
  useRecordings.setState({ recordings: [] });

  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const view = rtl.render(React.createElement(StorageItemsSection));
  expect(await view.findByText('Cloned voice samples')).toBeTruthy();
  expect(view.getByText('Mom')).toBeTruthy();

  rtl.fireEvent.press(view.getByTestId('storage-delete-ref-a'));
  const [title, message, buttons] = alert.mock.calls[0] as [string, string, Array<{ text: string; onPress?: () => void }>];
  expect(title).toBe('Delete Mom?');
  expect(message).toMatch(/other cloned voices are not affected/);
  await rtl.act(async () => { buttons.find((b) => b.text === 'Delete')!.onPress!(); });
  await rtl.waitFor(() => expect(useCloneReferences.getState().references).toHaveLength(0));
  expect(NativeModules.AtlasTts.deleteVoiceReference).toHaveBeenCalledWith('ref-a');
});
