import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { NEEDS_PERMISSION, uniqueSensors, type ListedSensor } from './sensorCatalog';

const Native: any = Platform.OS === 'android' ? NativeModules.AtlasSensor : undefined;

export interface SensorsState {
  /** False when this build or phone cannot list sensors. */
  available: boolean;
  sensors: ListedSensor[];
  values: Record<number, number[]>;
  /** Types that were asked to report but could not (missing or needs a permission). */
  silent: number[];
}

/** Every sensor the phone has, each one reporting live while the screen is open. */
export function useSensors(): SensorsState {
  const [state, setState] = useState<SensorsState>({ available: !!Native?.listSensors, sensors: [], values: {}, silent: [] });
  useEffect(() => {
    if (!Native?.listSensors) return;
    let alive = true;
    const started: number[] = [];
    const em = new NativeEventEmitter(Native);
    const sub = em.addListener('AtlasSensorValue', (e: { type: number; values: number[] }) => {
      setState((s) => ({ ...s, values: { ...s.values, [e.type]: e.values } }));
    });
    (async () => {
      const sensors = uniqueSensors(await Native.listSensors());
      if (!alive) return;
      setState((s) => ({ ...s, sensors }));
      const silent: number[] = [];
      for (const sensor of sensors) {
        if (NEEDS_PERMISSION.has(sensor.type)) { silent.push(sensor.type); continue; }
        const ok = await Native.startSensor(sensor.type).catch(() => false);
        if (ok) started.push(sensor.type); else silent.push(sensor.type);
      }
      if (alive) setState((s) => ({ ...s, silent }));
    })().catch(() => undefined);
    return () => { alive = false; sub.remove(); started.forEach((t) => Native.stopSensor(t).catch(() => undefined)); };
  }, []);
  return state;
}
