import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { usePressureLog } from '../atlasTools/pressureLog';

const PRESSURE = 6;
const Native: any = Platform.OS === 'android' ? NativeModules.AtlasSensor : undefined;

/**
 * Reads the barometer alone (not every sensor) while the screen is open, and adds each reading to the pressure log
 * (one is kept every ten minutes). `state` is 'unavailable' when this phone has no barometer or this build cannot read sensors.
 */
export function useBarometer(): { hpa: number | null; state: 'starting' | 'reading' | 'unavailable' } {
  const [hpa, setHpa] = useState<number | null>(null);
  const [state, setState] = useState<'starting' | 'reading' | 'unavailable'>(Native?.startSensor ? 'starting' : 'unavailable');
  const record = usePressureLog((s) => s.record);
  useEffect(() => {
    if (!Native?.startSensor) return;
    let alive = true;
    const sub = new NativeEventEmitter(Native).addListener('AtlasSensorValue', (e: { type: number; values: number[] }) => {
      if (e.type !== PRESSURE || !Number.isFinite(e.values?.[0])) return;
      setHpa(e.values[0]); setState('reading');
      record({ at: Date.now(), hpa: e.values[0] });
    });
    Promise.resolve(Native.startSensor(PRESSURE)).then((ok: boolean) => { if (alive && !ok) setState('unavailable'); }).catch(() => alive && setState('unavailable'));
    return () => { alive = false; sub.remove(); Promise.resolve(Native.stopSensor(PRESSURE)).catch(() => undefined); };
  }, [record]);
  return { hpa, state };
}
