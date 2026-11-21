/**
 * The Sensors screen lists every sensor the phone has with a live reading, says which usual sensors are missing, and
 * shows GPS height and air-pressure height side by side. Fakes only the device boundary (the sensor module).
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

it('shows each sensor the phone has with its reading, names the ones it lacks, and keeps the tools in reach', async () => {
  installNativeBoundary({ fs: true });
  const rtl = requireRTL();
  const React = require('react');
  const { NativeModules, Platform } = require('react-native');
  Platform.OS = 'android';
  const listeners: Array<(e: any) => void> = [];
  NativeModules.AtlasSensor = {
    listSensors: jest.fn(async () => [
      { type: 5, name: 'Light sensor', vendor: 'Acme', stringType: 'android.sensor.light' },
      { type: 6, name: 'Barometer', vendor: 'Acme', stringType: 'android.sensor.pressure' },
      { type: 6, name: 'Barometer (wake-up copy)', vendor: 'Acme', stringType: 'android.sensor.pressure' },
      { type: 4, name: 'Gyro', vendor: 'Acme', stringType: 'android.sensor.gyroscope' },
      { type: 21, name: 'Heart rate', vendor: 'Acme', stringType: 'android.sensor.heart_rate' },
    ]),
    startSensor: jest.fn(async () => true), stopSensor: jest.fn(async () => true),
    addListener: jest.fn(), removeListeners: jest.fn(),
  };
  // The sensor module's events are driven from the test, the same way the harness drives other native events.
  Object.defineProperty(require('react-native'), 'NativeEventEmitter', {
    configurable: true,
    value: function FakeNativeEventEmitter() {
      return { addListener: (name: string, fn: (e: any) => void) => { if (name === 'AtlasSensorValue') listeners.push(fn); return { remove: jest.fn() }; }, removeAllListeners: () => undefined };
    },
  });
  const { SensorsScreen } = require('../../../src/sensors/SensorsScreen');
  const { useMaps } = require('../../../src/atlasMaps/maps');
  useMaps.setState({ lastFix: { lat: 45.5, lon: -122.6, accuracy: 8, altitude: 120, speed: 0, time: Date.now() }, imperial: false });

  const view = rtl.render(React.createElement(SensorsScreen));
  expect(await view.findByTestId('sensor-5')).toBeTruthy();
  expect(view.getAllByTestId('sensor-6')).toHaveLength(1); // one entry per type, not one per wake-up copy
  await rtl.act(async () => { listeners.forEach((fn) => { fn({ type: 5, values: [312] }); fn({ type: 6, values: [1009.4] }); fn({ type: 4, values: [0.1, 0, 0] }); }); });
  expect(view.getByTestId('sensor-value-5').props.children).toBe('312 lux');
  expect(view.getByTestId('sensor-value-6').props.children).toBe('1009.4 hPa');
  expect(view.getByText(/Not found on this phone: Proximity, Humidity, Air temperature/)).toBeTruthy();
  expect(view.getByTestId('sensor-value-21').props.children).toMatch(/permission/);
  // GPS height and pressure height, side by side.
  expect(view.getByText(/GPS: 120 m/)).toBeTruthy();
  expect(view.getByText(/Air pressure: \d+ m \(1009.4 hPa\)/)).toBeTruthy();
  expect(view.getByTestId('sensor-tool-Compass')).toBeTruthy();
});
