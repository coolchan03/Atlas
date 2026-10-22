import { NativeModules } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface HealthStatus { supported: boolean; available: boolean; permissions: { steps: boolean; heartRate: boolean } }

export async function readHealthSummary(days = 1): Promise<string> {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 7) return 'Choose between 1 and 7 days.';
  const native = NativeModules.AtlasHealthConnect;
  if (!native?.status || !native?.readSummary) return 'Health Connect requires the updated Android build.';
  const status: HealthStatus = await native.status();
  if (!status.available) return 'Health Connect is unavailable on this device (this build supports Android 14 and newer).';
  if (!status.permissions.steps && !status.permissions.heartRate) {
    const open = await DT.confirm('Set up Health Connect?', 'Atlas needs your permission to read steps and heart-rate history. Open Android Health Connect permission settings?', 'Open settings');
    if (!open) return 'Health access was not granted.';
    await native.openPermissions();
    return 'Opened Health Connect settings. Grant the permissions you want, then ask Atlas again.';
  }
  const ok = await DT.confirm('Read Health Connect data?', `Read recorded steps and average heart rate for the last ${n} day(s)? Nothing is uploaded by this tool.`, 'Read');
  if (!ok) return 'The user declined to read health data.';
  const data = await native.readSummary(n);
  const steps = data.steps == null ? 'unavailable or no records' : Math.round(data.steps).toLocaleString();
  const bpm = data.averageHeartRateBpm == null ? 'unavailable or no records' : Math.round(data.averageHeartRateBpm) + ' bpm';
  return `Health Connect (${n} day(s), recorded data): steps: ${steps}; average recorded heart rate: ${bpm}. Not a live heart-rate measurement; missing entries do not mean zero.`;
}
