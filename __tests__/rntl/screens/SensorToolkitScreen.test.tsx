/** Sensor polling follows real navigation focus and app state; only device boundaries are faked. */
import '../../../src/theme/patchText';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { AppState, AppStateStatus, Dimensions, NativeModules, PermissionsAndroid, PermissionStatus, StyleSheet, Text } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SensorToolkitScreen, SensorSnapshot } from '../../../src/screens/SensorToolkitScreen';
import { useAppStore } from '../../../src/stores/appStore';
import { startTextAppearance } from '../../../src/theme/globalText';

jest.unmock('@react-navigation/native');
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const platform = jest.requireActual('react-native/Libraries/Utilities/Platform').default;
  Object.defineProperty(platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(platform, 'Version', { configurable: true, value: 33 });
  platform.select = (choices: Record<string, unknown>) => choices.android ?? choices.native ?? choices.default;
  return { __esModule: true, default: platform };
});

const Stack = createNativeStackNavigator();
const Compass = () => <Text>Compass page</Text>;
const sample = (pressureHpa: number, permissionGranted = false): SensorSnapshot => ({
  sampledAt: 1, pressureHpa, sensors: { pressure: true },
  bluetooth: { available: true, enabled: true, permissionGranted },
});
const resize = (width: number) => Dimensions.set({
  window: { width, height: 900, scale: 1, fontScale: 1 },
  screen: { width, height: 900, scale: 1, fontScale: 1 },
});

beforeAll(() => { startTextAppearance(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

it('samples only the current foreground visit and ignores stale reads and permissions', async () => {
  jest.useFakeTimers();
  resize(390);
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  const appState = (state: AppStateStatus) => act(() => {
    AppState.currentState = state;
    listeners.forEach(listener => listener(state));
  });
  const pending: Array<{ resolve: (value: SensorSnapshot) => void; reject: (error: Error) => void }> = [];
  const snapshot = jest.fn(() => new Promise<SensorSnapshot>((resolve, reject) => {
    pending.push({ resolve, reject });
  }));
  NativeModules.AtlasEnvironment = { snapshot };
  let permission: (value: PermissionStatus) => void = () => {};
  jest.spyOn(PermissionsAndroid, 'request').mockImplementation(() => new Promise(resolve => {
    permission = resolve;
  }));
  const state = useAppStore.getState();
  useAppStore.setState({ themeMode: 'light', settings: { ...state.settings, appearance: undefined } });
  const navigation = createNavigationContainerRef();
  const screen = render(
    <NavigationContainer ref={navigation}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="Sensors" component={SensorToolkitScreen} />
        <Stack.Screen name="Compass" component={Compass} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Refresh sensor readings')).toBeDisabled();
  await act(async () => { pending.shift()!.resolve(sample(1000)); });
  expect(screen.getByLabelText('Air pressure: 1000.0 hPa')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByLabelText('Air pressure: 1000.0 hPa').props.style).width).toBe('100%');

  fireEvent.press(screen.getByLabelText('Refresh sensor readings'));
  appState('background');
  await act(async () => { pending.shift()!.resolve(sample(900)); });
  expect(screen.getByLabelText('Air pressure: 1000.0 hPa')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(36000); });
  expect(snapshot).toHaveBeenCalledTimes(2);
  appState('active');
  expect(snapshot).toHaveBeenCalledTimes(3);

  fireEvent.press(screen.getByText('Open compass'));
  expect(navigation.getCurrentRoute()?.name).toBe('Compass');
  act(() => { navigation.goBack(); });
  expect(snapshot).toHaveBeenCalledTimes(3);
  await act(async () => { pending.shift()!.resolve(sample(850)); });
  expect(screen.getByLabelText('Air pressure: 1000.0 hPa')).toBeTruthy();
  expect(snapshot).toHaveBeenCalledTimes(4);
  await act(async () => { pending.shift()!.resolve(sample(1010)); });

  fireEvent.press(screen.getByText('Allow Bluetooth status access'));
  expect(PermissionsAndroid.request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  fireEvent.press(screen.getByText('Open compass'));
  await act(async () => { permission(PermissionsAndroid.RESULTS.GRANTED); });
  expect(snapshot).toHaveBeenCalledTimes(4);
  act(() => { jest.advanceTimersByTime(24000); });
  expect(snapshot).toHaveBeenCalledTimes(4);
  act(() => { navigation.goBack(); });
  expect(snapshot).toHaveBeenCalledTimes(5);
  await act(async () => { pending.shift()!.reject(new Error('Sensor driver busy')); });
  expect(screen.getByText('Sensor driver busy')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Refresh sensor readings'));
  await act(async () => { pending.shift()!.resolve(sample(1020, true)); });
  expect(screen.queryByText('Sensor driver busy')).toBeNull();
  expect(screen.queryByText('Allow Bluetooth status access')).toBeNull();

  await act(async () => {
    resize(1024);
    await useAppStore.setState({
      themeMode: 'dark', settings: { ...state.settings, appearance: { font: 'serif', textSize: 'xlarge' } },
    });
  });
  expect(StyleSheet.flatten(screen.getByLabelText('Air pressure: 1020.0 hPa').props.style).width).toBe('48%');
  expect(StyleSheet.flatten(screen.getByText('Sensor toolkit').props.style).fontFamily).toBe('AtlasBook');
  act(() => { jest.advanceTimersByTime(12000); });
  expect(snapshot).toHaveBeenCalledTimes(7);
  await act(async () => { pending.shift()!.resolve(sample(1030, true)); });
  expect(screen.getByLabelText('Air pressure: 1030.0 hPa')).toBeTruthy();
  screen.unmount();
  expect(listeners.size).toBe(0);
});
