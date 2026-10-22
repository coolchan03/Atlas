/** On-demand Android hardware readings, no background tracking. */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface Snapshot {
  sampledAt: number;
  wifi: { available: boolean; enabled: boolean; connected: boolean };
  bluetooth: { available: boolean; permissionGranted: boolean; enabled?: boolean };
  sensors: { pressure: boolean; ambientTemperature: boolean };
  pressureHpa?: number;
  ambientTemperatureC?: number;
  temperatureChangeCPerHour?: number;
}

function bridge() {
  if (Platform.OS !== 'android' || !NativeModules.AtlasEnvironment) {
    throw new Error('Environment sensing requires the updated Atlas Android app.');
  }
  return NativeModules.AtlasEnvironment;
}

export async function readDeviceSensors(): Promise<string> {
  const snap: Snapshot = await bridge().snapshot();
  const wifi = !snap.wifi.available ? 'not supported' : snap.wifi.connected ? 'connected' : snap.wifi.enabled ? 'on (not connected)' : 'off';
  const bt = !snap.bluetooth.available ? 'not supported' : !snap.bluetooth.permissionGranted ? 'permission needed' : snap.bluetooth.enabled ? 'on' : 'off';
  const pressure = typeof snap.pressureHpa === 'number' ? `${snap.pressureHpa.toFixed(1)} hPa` : snap.sensors.pressure ? 'no reading' : 'no sensor installed';
  const temp = typeof snap.ambientTemperatureC === 'number' ? `${snap.ambientTemperatureC.toFixed(1)} C` : snap.sensors.ambientTemperature ? 'no reading' : 'no ambient-temperature sensor';
  const trend = typeof snap.temperatureChangeCPerHour === 'number' ? `${snap.temperatureChangeCPerHour.toFixed(2)} C/hour` : 'needs another reading at least five minutes later';
  return `Sample: ${new Date(snap.sampledAt).toLocaleString()}\nWi-Fi: ${wifi}\nBluetooth: ${bt}\nAir pressure: ${pressure}\nAmbient temperature: ${temp}\nTemperature rate: ${snap.sensors.ambientTemperature ? trend : 'no ambient-temperature sensor'}. Device measurements are not weather forecasts.`;
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
