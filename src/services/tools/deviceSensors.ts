/** On-demand Android hardware readings, no background tracking. */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface Snapshot {
  sampledAt: number;
  wifi: { available: boolean; enabled: boolean; connected: boolean };
  bluetooth: { available: boolean; permissionGranted: boolean; enabled?: boolean };
  sensors: {
    pressure: boolean; ambientTemperature: boolean; humidity?: boolean;
    light?: boolean; proximity?: boolean; accelerometer?: boolean;
    gyroscope?: boolean; magneticField?: boolean;
  };
  pressureHpa?: number;
  pressureChangeHpaPerHour?: number;
  ambientTemperatureC?: number;
  temperatureChangeCPerHour?: number;
  humidityPercent?: number; lightLux?: number; proximityCm?: number;
  battery?: { percent?: number; charging?: boolean; batteryTemperatureC?: number };
  accelerationMs2?: { x: number; y: number; z: number };
  rotationRadPerSec?: { x: number; y: number; z: number };
  magneticMicroT?: { x: number; y: number; z: number };
}

function bridge() {
  if (Platform.OS !== 'android' || !NativeModules.AtlasEnvironment) {
    throw new Error('Environment sensing requires the updated Atlas Android app.');
  }
  return NativeModules.AtlasEnvironment;
}

export async function readDeviceSensors(): Promise<string> {
  const snap: Snapshot = await bridge().snapshot();
  const wifi = !snap.wifi.available ? 'not supported' : snap.wifi.connected ? 'connected' :
    snap.wifi.enabled ? 'on (not connected)' : 'off';
  const bt = !snap.bluetooth.available ? 'not supported' : !snap.bluetooth.permissionGranted ?
    'permission needed' : snap.bluetooth.enabled ? 'on' : 'off';
  const format = (n: number | undefined, unit: string, digits = 1) =>
    typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) + ' ' + unit : 'no reading';
  const sensor = (key: keyof Snapshot['sensors'], n: number | undefined, unit: string) =>
    !snap.sensors[key] ? 'not installed' : format(n, unit);
  const vector = (v: { x: number; y: number; z: number } | undefined, unit: string) =>
    v && [v.x, v.y, v.z].every(Number.isFinite)
      ? [v.x, v.y, v.z].map(n => n.toFixed(2)).join(' / ') + ' ' + unit : 'no reading';
  const lines = [
    'Sample: ' + new Date(snap.sampledAt).toLocaleString(),
    'Wi-Fi: ' + wifi, 'Bluetooth: ' + bt,
    'Air pressure: ' + sensor('pressure', snap.pressureHpa, 'hPa'),
    'Pressure trend: ' + (!snap.sensors.pressure ? 'not installed' : format(snap.pressureChangeHpaPerHour, 'hPa/hour', 2)),
    'Ambient air temperature: ' + sensor('ambientTemperature', snap.ambientTemperatureC, 'C'),
    'Temperature trend: ' + (!snap.sensors.ambientTemperature ? 'not installed' : format(snap.temperatureChangeCPerHour, 'C/hour', 2)),
    'Humidity: ' + sensor('humidity', snap.humidityPercent, '%'),
    'Light: ' + sensor('light', snap.lightLux, 'lux'),
    'Proximity: ' + sensor('proximity', snap.proximityCm, 'cm'),
    'Acceleration X / Y / Z: ' + (!snap.sensors.accelerometer ? 'not installed' : vector(snap.accelerationMs2, 'm/s2')),
    'Rotation X / Y / Z: ' + (!snap.sensors.gyroscope ? 'not installed' : vector(snap.rotationRadPerSec, 'rad/s')),
    'Magnetic field X / Y / Z: ' + (!snap.sensors.magneticField ? 'not installed' : vector(snap.magneticMicroT, 'microtesla')),
    'Battery: ' + format(snap.battery?.percent, '%', 0) + (snap.battery?.charging ? ' charging' : ''),
    'Battery temperature (not air temperature): ' + format(snap.battery?.batteryTemperatureC, 'C'),
    'Trends require readings at least five minutes apart. These are device readings, not weather forecasts or certified emergency measurements.',
  ];
  return lines.join('\n');
}

export async function scanNearbyDevices(): Promise<string> {
  const native = bridge();
  const ok = await DT.confirm('Scan nearby Bluetooth devices?', 'Scan for up to seven seconds, showing device names and signal strength. No MAC addresses are returned. A stronger signal does not prove distance.', 'Scan');
  if (!ok) return 'The user cancelled the Bluetooth scan.';
  const permissions = Number(Platform.Version) >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const granted = await PermissionsAndroid.requestMultiple(permissions);
  if (permissions.some(p => granted[p] !== PermissionsAndroid.RESULTS.GRANTED)) {
    return 'Nearby-device permission was denied; nothing scanned.';
  }
  const devices: Array<{ name: string; signalDbm: number }> = await native.scanNearby();
  if (!devices.length) return 'No BLE devices were detected advertising during the scan.';
  return devices.slice(0, 20).map(d => `- ${d.name}: ${d.signalDbm} dBm`).join('\n') +
    '\nSignal strength is not a reliable distance estimate.';
}
