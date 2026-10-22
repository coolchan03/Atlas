jest.mock('react-native', () => ({
  Platform: { OS: 'android' }, NativeModules: {}, useWindowDimensions: () => ({ width: 400 }),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(), useNavigation: () => ({ goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-native-vector-icons/Feather', () => 'FeatherIcon');
jest.mock('../../../../src/theme', () => ({
  useTheme: () => ({ colors: {} }),
}));
jest.mock('../../../../src/atlasTools/offGrid', () => ({
  useEmergencyColors: (colors: unknown) => colors,
}));
import { sensorValue, sensorVector, availability } from '../../../../src/screens/SensorToolkitScreen';

describe('Atlas offline sensor toolkit', () => {
  it('renders numeric values without inferring missing readings', () => {
    expect(sensorValue(1012.345, 'hPa')).toBe('1012.3 hPa');
    expect(sensorValue(0, '°C')).toBe('0.0 °C');
    expect(sensorValue(undefined, '°C')).toBe('No reading');
    expect(sensorValue(Number.NaN, '°C')).toBe('No reading');
  });
  it('distinguishes unavailable sensors from missing measurements', () => {
    const noSensor = { sampledAt: 0, sensors: { pressure: false } };
    expect(availability(noSensor, 'pressure', undefined, 'hPa')).toBe('Not installed');
    const present = { sampledAt: 0, sensors: { pressure: true } };
    expect(availability(present, 'pressure', undefined, 'hPa')).toBe('No reading');
    expect(availability(present, 'pressure', 1013.2, 'hPa')).toBe('1013.2 hPa');
  });
  it('reports motion components and rejects invalid vectors', () => {
    expect(sensorVector({ x: 1, y: -3, z: 9.81 }, 'm/s²')).toBe('1.00 / -3.00 / 9.81 m/s²');
    expect(sensorVector(undefined, 'rad/s')).toBe('No reading');
    expect(sensorVector({ x: NaN, y: 0, z: 0 }, 'rad/s')).toBe('No reading');
  });
});
