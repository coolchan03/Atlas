import { NativeModules } from 'react-native';
import { levelFromBatteryTemp, thermalHot, useThermal } from './thermalState';

export { useThermal };

let timer: ReturnType<typeof setInterval> | null = null;

/** One reading: Android's thermal status, else the battery temperature. Anything unreadable leaves the last level alone. */
export async function checkThermalNow(): Promise<void> {
  try {
    const dev = NativeModules.AtlasDevice;
    if (!dev) return;
    const status: number = typeof dev.getThermalStatus === 'function' ? await dev.getThermalStatus() : -1;
    if (typeof status === 'number' && status >= 0) { useThermal.getState().set(status); return; }
    const temp: number = typeof dev.getBatteryTemperature === 'function' ? await dev.getBatteryTemperature() : -999;
    if (typeof temp === 'number' && temp > -100) useThermal.getState().set(levelFromBatteryTemp(temp, thermalHot()));
  } catch { /* heat info unavailable */ }
}

/** Reads the heat level every 30 seconds while the app is open. */
export function startThermalMonitor(): void {
  if (timer) return;
  void checkThermalNow();
  timer = setInterval(() => { void checkThermalNow(); }, 30000);
}
