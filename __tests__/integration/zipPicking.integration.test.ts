/**
 * Picking a zip of study material (for example for the FAR exam). The picker is the device boundary: it is asked for every file,
 * because a type filter greys out a zip the phone labels differently, and the name is checked afterwards.
 */
import { Alert } from 'react-native';
import { installNativeBoundary } from '../harness/nativeBoundary';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const mockPick = jest.fn();
jest.mock('@react-native-documents/picker', () => ({
  pick: (...a: unknown[]) => mockPick(...a), types: { allFiles: '*/*', zip: 'application/zip' },
  isErrorWithCode: () => false, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  keepLocalCopy: async ({ files }: { files: Array<{ uri: string }> }) => files.map((f) => ({ status: 'success', localUri: f.uri })),
}));

// The harness's fake zip is JSON, so its file list comes from that JSON (the real directory reader has its own tests in zipDirectory.test).
jest.mock('../../src/learning/zipDirectory', () => ({
  readZipDirectory: async (path: string) => {
    const RNFS = require('react-native-fs');
    const { files } = JSON.parse(await RNFS.readFile(path, 'utf8'));
    return Object.entries(files).map(([name, data]) => ({ name, compressed: 1, size: Buffer.from(String(data), 'base64').length }));
  },
}));

async function setup(files: Record<string, string>, name = 'FAR materials.zip') {
  installNativeBoundary({ fs: true });
  const RNFS = require('react-native-fs');
  await RNFS.mkdir('/in');
  await RNFS.writeFile(`/in/${name}`, JSON.stringify({ files }), 'utf8');
  mockPick.mockReset();
  mockPick.mockResolvedValue([{ uri: `file:///in/${name}`, name }]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  return require('../../src/learning/zipImport');
}

it('asks the picker for every file, not for particular zip types', async () => {
  const { pickAndAddZip } = await setup({ 'notes.bin': b64('x') });
  await pickAndAddZip('p1').catch(() => undefined);
  expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ type: ['*/*'] }));
});

it('says so when the file picked is not a zip', async () => {
  const { pickAndAddZip } = await setup({}, 'FAR notes.pdf');
  expect(await pickAndAddZip('p1')).toBeNull();
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('That is not a zip file');
});

it('says what is in a zip that holds nothing Atlas can read, instead of closing without a word', async () => {
  const { pickAndAddZip } = await setup({ 'video/lecture1.mp4': b64('v'), 'video/lecture2.mp4': b64('v') });
  await pickAndAddZip('p1');
  const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('Nothing in this zip can be added');
  expect(body).toContain('2 files in the zip');
  expect(body).toContain('2 not readable');
});

it('asks before adding the books in a zip of study material', async () => {
  const { pickAndAddZip } = await setup({ 'FAR/Ch1 Leases.pdf': b64('lease text '.repeat(30)), 'FAR/Ch2 Revenue.pdf': b64('revenue text '.repeat(30)) });
  (Alert.alert as jest.Mock).mockImplementation((_t: string, _m: string, buttons: Array<{ text: string; onPress?: () => void }>) => buttons.find((b) => /Cancel/.test(b.text))?.onPress?.());
  const result = await pickAndAddZip('p1');
  const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('Add from this zip?');
  expect(body).toContain('2 books or documents');
  expect(result).toMatchObject({ added: [] }); // declined: nothing added
});
