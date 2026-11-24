import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
const mockAsk = jest.fn();
jest.mock('../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockAsk(...a) }));

// The GPS is the device boundary: a fake native module that the test feeds positions through.
const handlers: Record<string, (f: unknown) => void> = {};
const T0 = 1_700_000_000_000;
const fix = (northSteps: number, extra: Record<string, number> = {}) => ({ lat: 40 + northSteps * 0.0003, lon: -105, accuracy: 5, altitude: 1600 + northSteps * 4, speed: 1, time: T0 + northSteps * 60_000, ...extra });

it('records a walk (ignoring poor fixes), leads the way back, and writes a journal page whose numbers come from the route', async () => {
  jest.resetModules();
  installNativeBoundary({ fs: true });
  const rn = require('react-native');
  rn.NativeModules.AtlasDevice = { startLocation: jest.fn(async () => undefined), stopLocation: jest.fn(async () => undefined), lastLocation: jest.fn(async () => null), addListener: jest.fn(), removeListeners: jest.fn() };
  Object.defineProperty(rn, 'NativeEventEmitter', { configurable: true, value: function Emitter() { return { addListener: (name: string, cb: (f: unknown) => void) => { handlers[name] = cb; return { remove: jest.fn() }; } }; } });
  jest.spyOn(rn.PermissionsAndroid, 'requestMultiple').mockResolvedValue({ [rn.PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: 'granted', [rn.PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: 'granted' });
  const rtl = requireRTL();
  const React = require('react');
  const { TrailScreen } = require('../../src/trail/TrailScreen');
  const { useTrails } = require('../../src/trail/store');
  const { useMaps } = require('../../src/atlasMaps/maps');
  const { useJournal, dayKey } = require('../../src/journal/store');
  useMaps.setState({ imperial: false, lastFix: null });
  useJournal.setState({ entries: [] });

  const view = rtl.render(React.createElement(TrailScreen));
  await rtl.act(async () => { await Promise.resolve(); });
  rtl.fireEvent.changeText(view.getByTestId('trail-name'), 'Ridge loop');
  rtl.fireEvent.press(view.getByTestId('trail-start'));

  // Ten steps of about 33 m north; a poor fix and a step too small to count are ignored.
  await rtl.act(async () => {
    for (let i = 0; i <= 10; i += 1) {
      handlers.AtlasLocation(fix(i));
      if (i === 4) { handlers.AtlasLocation(fix(4.5, { accuracy: 200 })); handlers.AtlasLocation(fix(i, { lat: 40 + i * 0.0003 + 0.00002 })); }
    }
  });
  const [trail] = useTrails.getState().trails;
  expect(trail.points).toHaveLength(11);
  expect(view.getByTestId('trail-live').props.children).toMatch(/^\d{3} m {2}·/); // about 333 m
  rtl.fireEvent.press(view.getByTestId('trail-stop'));
  expect(useTrails.getState().activeId).toBeNull();

  // From the far end the way back is south, and the distance left is the route's length; at the start it says so.
  rtl.fireEvent.press(view.getByTestId(`trail-back-${trail.id}`));
  await rtl.act(async () => { handlers.AtlasLocation(fix(10)); });
  expect(view.getByTestId('trail-heading').props.children).toMatch(/^Head S \(1[78]\d°\) for /);
  await rtl.act(async () => { handlers.AtlasLocation(fix(0, { lat: 40.00005 })); });
  expect(view.getByTestId('trail-arrived')).toBeTruthy();
  await rtl.act(async () => { handlers.AtlasLocation(fix(5, { lon: -105.002 })); });
  expect(view.getByTestId('trail-off-route')).toBeTruthy();

  // The page: facts from the route; a story that invents a number is dropped.
  rtl.fireEvent.changeText(view.getByTestId(`trail-note-${trail.id}`), 'Windy but bright.');
  mockAsk.mockResolvedValueOnce('We walked 12 km along the ridge in the wind and it felt great.');
  await rtl.act(async () => { rtl.fireEvent.press(view.getByTestId(`trail-write-${trail.id}`)); });
  const page = view.getByTestId(`trail-page-${trail.id}`).props.children;
  expect(page).toMatch(/^Ridge loop\. Distance 3\d\d m, in 10 min/);
  expect(page).toMatch(/Climbed 40 m/);
  expect(page).not.toMatch(/12 km/);
  rtl.fireEvent.press(view.getByTestId(`trail-journal-${trail.id}`));
  expect(useJournal.getState().entries[0].text).toMatch(/^Ridge loop\./);
  expect(useJournal.getState().entries[0].day).toBe(dayKey(new Date(useTrails.getState().trails[0].endedAt)));
});
