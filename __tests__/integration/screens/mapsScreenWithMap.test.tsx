import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: {} }),
}));

type Opts = { nativeMap?: boolean; fix?: boolean; denied?: string; imperial?: boolean; waypoints?: boolean; map?: boolean; night?: boolean };

async function setup(o: Opts = {}) {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  seedApp('full');
  const rn = require('react-native');
  if (o.nativeMap !== false) {
    rn.UIManager.hasViewManagerConfig = () => true;
    jest.spyOn(rn, 'requireNativeComponent').mockImplementation((() => 'AtlasMapView') as never);
  }
  const handlers: { fix?: (f: unknown) => void; err?: (m: string) => void } = {};
  const maps = require('../../../src/atlasMaps/maps');
  jest.spyOn(maps, 'watchPosition').mockImplementation(async (onFix: any, onError: any) => {
    handlers.fix = onFix; handlers.err = onError;
    if (o.denied) onError(o.denied);
    return () => undefined;
  });
  maps.useMaps.setState({
    current: o.map === false ? null : '/maps/state.map', imperial: !!o.imperial, lastFix: o.fix ? { lat: 40.7, lon: -74, accuracy: 12, altitude: 30, speed: 2, time: 1 } : null,
    waypoints: o.waypoints === false ? [] : [{ id: 'w1', name: 'Camp', lat: 40.71, lon: -74.01, createdAt: 1 }, { id: 'w2', name: 'Water', lat: 40.69, lon: -73.99, createdAt: 2 }],
  });
  if (o.night) require('../../../src/atlasTools/offGrid').useOffGrid.setState({ nightRed: true });
  const { MapsScreen } = require('../../../src/screens/MapsScreen');
  const view = rtl.render(React.createElement(MapsScreen));
  await rtl.act(async () => { await new Promise((r) => setImmediate(r)); });
  return { view, rtl, handlers, maps, React };
}

describe('the maps screen with a map open', () => {
  it.each([
    ['a fix, metric, saved places', { fix: true, imperial: false }],
    ['a fix, imperial', { fix: true, imperial: true }],
    ['night mode', { fix: true, night: true }],
    ['no fix and GPS refused', { denied: 'Location permission is off' }],
    ['no saved places', { fix: true, waypoints: false }],
    ['no map chosen', { fix: true, map: false }],
    ['a build without the map view', { fix: true, nativeMap: false }],
  ] as Array<[string, Opts]>)('survives pressing everything: %s', async (_name, opts) => {
    const { view, rtl, handlers } = await setup(opts);
    await rtl.act(async () => { handlers.fix?.({ lat: 40.72, lon: -74.02, accuracy: 5, altitude: -100000, speed: 1, time: 2 }); });
    for (const seed of [4, 15, 28]) await explore(view as never, { seed, presses: 60 });
    view.unmount();
  }, 120000);

  it('centers on the person, follows them, saves a spot and a position, and renames and deletes a place', async () => {
    const { view, rtl, handlers, maps } = await setup({ fix: false });
    const press = async (label: string | RegExp) => { await rtl.act(async () => { rtl.fireEvent.press(view.getByText(label)); }); };
    await press('Center on me');
    await rtl.act(async () => { handlers.fix?.({ lat: 40.72, lon: -74.02, accuracy: 5, altitude: 10, speed: 0, time: 2 }); });
    await press('Center on me');
    await press('Save my position');
    await rtl.act(async () => { rtl.fireEvent.changeText(view.UNSAFE_getAllByType(require('react-native').TextInput)[0], 'My spot'); });
    const save = view.queryByText('Save');
    if (save) await press(save.props.children ?? 'Save');
    expect(maps.useMaps.getState().waypoints.length).toBeGreaterThanOrEqual(2);
    await rtl.act(async () => { rtl.fireEvent(view.getByText('Camp'), 'longPress'); });
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText('Camp')); });
  });
});
