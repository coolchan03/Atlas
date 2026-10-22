import { installNativeBoundary, requireRTL, MB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {} }),
  useRoute: () => ({ params: { id: 'rec-a' } }),
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

it('keeps existing audio downloadable after a duplicate sync and a promotion failure', async () => {
  installNativeBoundary({ fs: true, ram: { platform: 'android', totalBytes: 8 * 1024 * MB, availBytes: 6 * 1024 * MB } });
  const React = require('react');
  const rtl = requireRTL();
  const RNFS = require('react-native-fs');
  const { receiveAudio, audioPathFor } = require('../../../src/services/nearbySync/audio');
  const { useRecordings } = require('../../../src/atlasRecorder/store');
  await useRecordings.persist.rehydrate();
  const path = audioPathFor('rec-a');
  await RNFS.mkdir(path.slice(0, path.lastIndexOf('/')));
  await RNFS.writeFile(path, 'RIFF original recording', 'utf8');
  useRecordings.setState({ consent: true, recordings: [{ id: 'rec-a', title: 'Meeting',
    createdAt: '2026-10-22T10:00:00Z', durationSec: 5, audioPath: path, status: 'done', utterances: [] }] });
  const { RecordingDetailScreen } = require('../../../src/atlasRecorder/RecordingDetailScreen');
  const screen = rtl.render(React.createElement(RecordingDetailScreen));
  RNFS.moveFile.mockRejectedValueOnce(new Error('Interrupted file promotion'));
  await expect(receiveAudio({ kind: 'audio', id: 'rec-a', index: 0, total: 1,
    data: Buffer.from('duplicate transfer').toString('base64') })).resolves.toBe(true);
  expect(await RNFS.readFile(path, 'utf8')).toBe('RIFF original recording');
  const picker = require('@react-native-documents/picker');
  picker.saveDocuments = jest.fn(async () => [{ name: 'Meeting.wav' }]);
  rtl.fireEvent.press(screen.getByTestId('recording-download-audio'));
  await rtl.waitFor(() => expect(picker.saveDocuments).toHaveBeenCalledWith(
    expect.objectContaining({ fileName: 'Meeting.wav', mimeType: 'audio/wav' })));
  screen.unmount();
});

it('serializes duplicate receives and keeps partial audio available after a failed new promotion', async () => {
  installNativeBoundary({ fs: true });
  const RNFS = require('react-native-fs');
  const { receiveAudio, audioPathFor } = require('../../../src/services/nearbySync/audio');
  const write = RNFS.writeFile.getMockImplementation();
  // The shared memfs boundary is text-only; honor native base64 writes for this audio fixture.
  RNFS.writeFile.mockImplementation((path: string, data: string, encoding?: string) =>
    write(path, encoding === 'base64' ? Buffer.from(data, 'base64').toString('utf8') : data));
  const chunk = { kind: 'audio', id: 'rec-new', index: 0, total: 1,
    data: Buffer.from('RIFF received recording').toString('base64') };
  RNFS.moveFile.mockRejectedValueOnce(new Error('Interrupted file promotion'));
  await expect(receiveAudio(chunk)).rejects.toThrow('Interrupted file promotion');
  expect(await RNFS.exists(`${audioPathFor(chunk.id)}.part`)).toBe(true);
  expect(await Promise.all([receiveAudio(chunk), receiveAudio(chunk)])).toEqual([true, true]);
  expect(await RNFS.readFile(audioPathFor(chunk.id), 'utf8')).toBe('RIFF received recording');
});
