jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { AtlasEnvironment: { snapshot: jest.fn().mockResolvedValue({
    sampledAt: Date.UTC(2026, 9, 22),
    wifi: { available: true, enabled: true, connected: true },
    bluetooth: { available: true, permissionGranted: false },
    sensors: {
      pressure: true, ambientTemperature: false, humidity: true, light: true,
      proximity: false, accelerometer: true, gyroscope: true, magneticField: true,
    },
    pressureHpa: 1015.25, pressureChangeHpaPerHour: -0.08,
    humidityPercent: 51.3, lightLux: 145,
    battery: { percent: 88, batteryTemperatureC: 31.2, charging: false },
    accelerationMs2: { x: 1, y: 0, z: 9.8 },
  }) } },
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({ confirm: jest.fn() }));
import { NativeModules } from 'react-native';
import { readDeviceSensors } from '../../../../src/services/tools/deviceSensors';

describe('Android environmental sensor text tool', () => {
  it('formats pressure and ambient conditions without inventing absent hardware', async () => {
    const result = await readDeviceSensors();
    expect(NativeModules.AtlasEnvironment.snapshot).toHaveBeenCalledTimes(1);
    expect(result).toContain('Air pressure: 1015.3 hPa');
    expect(result).toContain('Pressure trend: -0.08 hPa/hour');
    expect(result).toContain('Ambient air temperature: not installed');
    expect(result).toContain('Battery temperature (not air temperature)');
    expect(result).toContain('Acceleration X / Y / Z');
    expect(result).toContain('\nWi-Fi: connected');
    expect(result).toContain('Bluetooth: permission needed');
  });
});
