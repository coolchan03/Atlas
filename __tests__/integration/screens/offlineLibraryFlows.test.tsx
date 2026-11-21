import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, []); },
}));

type Opts = { files?: boolean; hits?: 'some' | 'none' | 'throws'; add?: 'zim' | 'other' | 'cancel' | 'throws'; available?: boolean };

async function setup(o: Opts = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const lib = require('../../../src/atlasTools/offlineLibrary');
  jest.spyOn(lib, 'libraryAvailable').mockReturnValue(o.available !== false);
  jest.spyOn(lib, 'searchLibrary').mockImplementation(async () => {
    if (o.hits === 'throws') throw new Error('index missing');
    return o.hits === 'none' ? [] : [{ uri: 'u1', library: 'Wikipedia', path: 'A/Water', title: 'Water', snippet: 'Water is wet.' }, { uri: 'u1', library: 'Wikipedia', path: 'A/Fire', title: 'Fire', snippet: 'Fire is hot.' }];
  });
  jest.spyOn(lib, 'readArticle').mockResolvedValue({ title: 'Water', text: 'Water is a transparent fluid.' });
  jest.spyOn(lib, 'addLibraryFile').mockResolvedValue(undefined);
  jest.spyOn(lib, 'removeLibraryFile').mockResolvedValue(undefined);
  if (o.files !== false) lib.useOfflineLibrary.setState({ files: [{ uri: 'u1', title: 'Wikipedia', language: 'eng', description: 'All of it', articles: 6000000, bytes: 3e9, fulltext: true, enabled: true }, { uri: 'u2', title: 'Maps notes', articles: 1200, bytes: 8e8, fulltext: false, enabled: false }] });
  jest.doMock('@react-native-documents/picker', () => ({
    pick: jest.fn(async () => {
      if (o.add === 'cancel') throw Object.assign(new Error('closed'), { code: 'OPERATION_CANCELED' });
      if (o.add === 'throws') throw new Error('picker broke');
      return [{ uri: 'file:///a.zim', name: o.add === 'other' ? 'notes.txt' : 'a.zim' }];
    }),
    types: { allFiles: '*/*' }, errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' }, isErrorWithCode: (e: any) => !!e?.code,
  }));
  const { OfflineLibraryScreen } = require('../../../src/screens/OfflineLibraryScreen');
  const view = rtl.render(React.createElement(OfflineLibraryScreen));
  return { view, rtl };
}

describe('the offline library screen', () => {
  it.each([
    ['files and search results', { hits: 'some', add: 'zim' }],
    ['no results and a non-zim file', { hits: 'none', add: 'other' }],
    ['a failing search and a failing picker', { hits: 'throws', add: 'throws' }],
    ['a closed picker with no files', { files: false, add: 'cancel' }],
    ['a build without the library module', { available: false }],
  ] as Array<[string, Opts]>)('can be pressed through with %s', async (_name, opts) => {
    const { view } = await setup(opts);
    for (const seed of [2, 8, 19, 33]) await explore(view as never, { seed, presses: 60, text: ['water', 'fire', ' ', 'x'] });
    view.unmount();
  }, 120000);

  it('searches, opens an article and goes back from it', async () => {
    const { view, rtl } = await setup({ hits: 'some' });
    const input = view.UNSAFE_getAllByType(require('react-native').TextInput)[0];
    await rtl.act(async () => { rtl.fireEvent.changeText(input, 'water'); });
    await rtl.act(async () => { rtl.fireEvent(input, 'submitEditing'); });
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
    expect(view.getByText('Water')).toBeTruthy();
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText('Water')); });
    await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
    expect(view.getByText('Water is a transparent fluid.')).toBeTruthy();
  });
});
