import { NativeModules } from 'react-native';
import { levelFromBatteryTemp, thermalHot, useThermal } from './thermalState';
import { useLowPower } from './lowPowerState';
import { showToast } from '../utils/toast';
import { nudgeOn } from './nudges';

let timer: ReturnType<typeof setInterval> | null = null;

/** Records a reading and tells the person when the guard turns on or off (only while the heat guard is switched on). */
export function recordThermal(level: number): void {
  const was = thermalHot();
  useThermal.getState().set(level);
  const now = thermalHot();
  if (was === now || !useLowPower.getState().heatGuard || !nudgeOn('statusNotices')) return;
  showToast(now ? 'The phone is hot: keeping answers short until it cools.' : 'The phone has cooled: back to full speed.');
}

/** One reading: Android's thermal status, else the battery temperature. Anything unreadable leaves the last level alone. */
export async function checkThermalNow(): Promise<void> {
  try {
    const dev = NativeModules.AtlasDevice;
    if (!dev) return;
    const status: number = typeof dev.getThermalStatus === 'function' ? await dev.getThermalStatus() : -1;
    if (typeof status === 'number' && status >= 0) { recordThermal(status); return; }
    const temp: number = typeof dev.getBatteryTemperature === 'function' ? await dev.getBatteryTemperature() : -999;
    if (typeof temp === 'number' && temp > -100) recordThermal(levelFromBatteryTemp(temp, thermalHot()));
  } catch { /* heat info unavailable */ }
}

/** Reads the heat level every 30 seconds while the app is open. */
export function startThermalMonitor(): void {
  if (timer) return;
  void checkThermalNow();
  timer = setInterval(() => { void checkThermalNow(); }, 30000);
}
